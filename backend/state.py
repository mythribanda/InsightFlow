import time
import os
import logging
import asyncio
import io
import pandas as pd
import numpy as np
from typing import Any

logger = logging.getLogger(__name__)

class TTLDict(dict):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.timestamps = {}

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self.timestamps[key] = time.time()

    def __getitem__(self, key):
        if key in self:
            self.timestamps[key] = time.time()
        return super().__getitem__(key)

    def get(self, key, default=None):
        if key in self:
            self.timestamps[key] = time.time()
            return super().get(key, default)
        return default

    def pop(self, key, *args):
        self.timestamps.pop(key, None)
        return super().pop(key, *args)

    def __delitem__(self, key):
        self.timestamps.pop(key, None)
        super().__delitem__(key)

    def clear(self):
        self.timestamps.clear()
        super().clear()


# Session store for fitted models (in-memory; use Redis for production)
model_store = TTLDict()
# Session store for raw DataFrames (in-memory; cached for downstream tasks like anomalies)
session_data_store = TTLDict()
# Session store for compiled model and anomaly results
model_results_store = TTLDict()
anomaly_results_store = TTLDict()
cluster_labels_store = TTLDict()
# Session store for background analysis jobs
analysis_jobs = TTLDict()


async def cleanup_sessions_task():
    """
    Background task running periodically to clean up expired sessions from TTLDicts.
    """
    logger.info("Background session cleanup task started.")
    while True:
        try:
            # Runs periodically (configurable via env, default 5 minutes)
            interval = int(os.getenv("SESSION_CLEANUP_INTERVAL_SECONDS", "300"))
            await asyncio.sleep(interval)
            
            ttl_minutes = int(os.getenv("SESSION_TTL_MINUTES", "30"))
            ttl_seconds = ttl_minutes * 60
            now = time.time()
            
            # Evict session_data_store
            expired_data = []
            for key, last_accessed in list(session_data_store.timestamps.items()):
                if now - last_accessed > ttl_seconds:
                    expired_data.append(key)
            if expired_data:
                before = len(session_data_store)
                for k in expired_data:
                    session_data_store.pop(k, None)
                after = len(session_data_store)
                logger.info(f"Evicted expired session data from session_data_store. Evicted: {expired_data}. Size before: {before}, after: {after}")
                
            # Evict analysis_jobs
            expired_jobs = []
            for key, last_accessed in list(analysis_jobs.timestamps.items()):
                if now - last_accessed > ttl_seconds:
                    expired_jobs.append(key)
            if expired_jobs:
                before = len(analysis_jobs)
                for k in expired_jobs:
                    analysis_jobs.pop(k, None)
                after = len(analysis_jobs)
                logger.info(f"Evicted expired jobs from analysis_jobs. Evicted: {expired_jobs}. Size before: {before}, after: {after}")
                
        except Exception as e:
            logger.error(f"Error in background session cleanup: {e}", exc_info=True)


def parse_request_data(data: Any) -> pd.DataFrame:
    """Parses raw request data into a DataFrame with proper types and missing values."""
    from fastapi import HTTPException
    import json

    # 25 MB payload limit (matching client-side limit)
    MAX_PAYLOAD_SIZE = 25 * 1024 * 1024
    
    payload_size = 0
    if isinstance(data, str):
        payload_size = len(data)
    else:
        try:
            payload_size = len(json.dumps(data))
        except:
            payload_size = 0
            
    if payload_size > MAX_PAYLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Payload size too large. Maximum allowed size is 25MB."
        )

    # Pre-check row/cell count limit if dictionary format
    if isinstance(data, dict):
        max_rows = 150000
        max_cells = 3000000
        row_count = 0
        cell_count = 0
        for col_name, col_values in data.items():
            if isinstance(col_values, list):
                row_count = max(row_count, len(col_values))
                cell_count += len(col_values)
        if row_count > max_rows or cell_count > max_cells:
            raise HTTPException(
                status_code=413,
                detail=f"Dataset dimensions exceed limits (max rows: {max_rows}, max cells: {max_cells})."
            )

    if isinstance(data, str):
        # Base64 or CSV string
        try:
            import base64
            decoded = base64.b64decode(data).decode('utf-8')
            df = pd.read_csv(io.StringIO(decoded))
        except:
            df = pd.read_csv(io.StringIO(data))
    else:
        # Dict format
        df = pd.DataFrame(data)

    # Post-check row/cell count limit on constructed DataFrame
    max_rows = 150000
    max_cells = 3000000
    if len(df) > max_rows or df.size > max_cells:
        raise HTTPException(
            status_code=413,
            detail=f"Dataset dimensions exceed limits (max rows: {max_rows}, max cells: {max_cells})."
        )
    
    # Standardize string representations of NaNs/empty space
    df = df.replace(r'^\s*$', np.nan, regex=True)
    
    # Try to convert each column to numeric if possible
    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col])
        except (ValueError, TypeError):
            pass

    # Ensure consistent string representation for categorical/non-numeric columns (preserving NaNs)
    # to prevent scikit-learn encoder exceptions on mixed types.
    categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()
    for col in categorical_cols:
        df[col] = df[col].map(lambda x: str(x) if pd.notna(x) else x)
            
    return df


def impute_missing(df: pd.DataFrame) -> pd.DataFrame:
    """
    Imputes missing values in a DataFrame:
    - Mean for numeric columns
    - Mode or "MISSING" for non-numeric columns
    """
    df_clean = df.copy()
    for col in df_clean.columns:
        if pd.api.types.is_numeric_dtype(df_clean[col]):
            df_clean[col] = df_clean[col].fillna(df_clean[col].mean())
        else:
            mode_series = df_clean[col].mode()
            mode_val = mode_series[0] if len(mode_series) > 0 else "MISSING"
            df_clean[col] = df_clean[col].fillna(mode_val)
    return df_clean


from fastapi import Header, HTTPException

def verify_session_owner(session_id: str, x_user_id: str = Header(None)):
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session ID")
    if not session_id.startswith("session_"):
        raise HTTPException(status_code=403, detail="Unauthorized: Invalid session format")
    parts = session_id.split("_")
    if len(parts) < 3:
        raise HTTPException(status_code=403, detail="Unauthorized: Invalid session format")
    owner_id = parts[1]
    if not x_user_id:
        raise HTTPException(status_code=403, detail="Unauthorized: Missing calling user credentials")
    if owner_id != x_user_id:
        raise HTTPException(status_code=403, detail="Unauthorized: Session owner mismatch")
