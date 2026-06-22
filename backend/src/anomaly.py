"""
Anomaly Detection module: Unsupervised anomaly detection with Isolation Forest
and robust standardized deviation attribution (deviation method).
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer


def preprocess_dataframe(df: pd.DataFrame) -> Tuple[np.ndarray, List[str]]:
    """
    Builds a simple pipeline to preprocess the dataframe for Isolation Forest:
    - Median imputation + StandardScaler for numeric columns.
    - Most frequent imputation + OneHotEncoder for categorical columns.
    """
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

    transformers = []
    if numeric_cols:
        transformers.append(
            ("num", Pipeline([
                ("imp", SimpleImputer(strategy="median")),
                ("sc", StandardScaler())
            ]), numeric_cols)
        )
    if categorical_cols:
        transformers.append(
            ("cat", Pipeline([
                ("imp", SimpleImputer(strategy="most_frequent")),
                ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
            ]), categorical_cols)
        )

    preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
    X_preprocessed = preprocessor.fit_transform(df)

    # Get feature names out if possible
    try:
        feature_names = preprocessor.get_feature_names_out().tolist()
    except Exception:
        feature_names = [f"feature_{i}" for i in range(X_preprocessed.shape[1])]

    return X_preprocessed, feature_names


def run_anomaly_detection(df: pd.DataFrame, contamination: float = 0.05) -> List[Dict[str, Any]]:
    """
    Runs Isolation Forest on the preprocessed DataFrame.
    For each anomalous row (flagged as -1), attributes the top 3 driving columns
    using the standardized deviation from the column's robust center (median/IQR).
    
    Returns a list of ranked anomalous rows, sorted by anomaly score in descending order.
    """
    if df.empty:
        return []

    # Preprocess
    X_preprocessed, _ = preprocess_dataframe(df)

    # Fit Isolation Forest
    iso = IsolationForest(contamination=contamination, random_state=42, n_jobs=-1)
    labels = iso.fit_predict(X_preprocessed)  # -1 for anomaly, 1 for normal
    scores = -iso.score_samples(X_preprocessed)  # higher is more anomalous (between 0 and 1)

    # Identify numeric and categorical columns
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

    # Precompute robust centers (median and IQR) for numeric columns
    numeric_stats = {}
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            continue
        median = float(series.median())
        q1 = float(series.quantile(0.25))
        q3 = float(series.quantile(0.75))
        iqr = q3 - q1
        if iqr < 1e-6:
            std = float(series.std())
            denominator = std if (not pd.isna(std) and std > 1e-6) else 1e-6
        else:
            denominator = iqr
        numeric_stats[col] = {"median": median, "denominator": denominator}

    # Precompute value frequencies for categorical columns (for fallback attribution)
    categorical_stats = {}
    for col in categorical_cols:
        vc = df[col].value_counts(normalize=True)
        categorical_stats[col] = vc.to_dict()

    anomalous_rows = []

    for i in range(len(df)):
        if labels[i] == -1:
            row_data = df.iloc[i]
            col_deviations = []

            # 1. Numeric deviation: |x - median| / IQR
            for col in numeric_cols:
                val = row_data[col]
                if pd.isna(val):
                    continue
                stats = numeric_stats.get(col)
                if stats:
                    dev = abs(float(val) - stats["median"]) / stats["denominator"]
                    col_deviations.append({
                        "column": col,
                        "value": val.item() if hasattr(val, "item") else val,
                        "deviation": float(dev),
                        "type": "numeric"
                    })

            # 2. Categorical rarity check: only attribute if frequency is below a threshold
            RARITY_THRESHOLD = 0.05
            for col in categorical_cols:
                val = row_data[col]
                if pd.isna(val):
                    continue
                freqs = categorical_stats.get(col, {})
                freq = freqs.get(val, 0.0)
                if freq < RARITY_THRESHOLD:
                    # Rare category! Deviation score represents rarity, scaled to align with deviation scores.
                    # Max rarity score (when frequency is close to 0) will be 3.0.
                    rarity_score = ((RARITY_THRESHOLD - freq) / RARITY_THRESHOLD) * 3.0
                    col_deviations.append({
                        "column": col,
                        "value": str(val),
                        "deviation": float(rarity_score),
                        "type": "categorical"
                    })

            # Sort and take top 3 drivers
            col_deviations.sort(key=lambda x: x["deviation"], reverse=True)
            drivers = col_deviations[:3]

            # Convert row_data to serializable dict
            serialized_row = {}
            for col, val in row_data.items():
                if pd.isna(val):
                    serialized_row[col] = None
                elif isinstance(val, (np.integer, np.floating)):
                    serialized_row[col] = val.item()
                else:
                    serialized_row[col] = str(val)

            anomalous_rows.append({
                "row_index": int(i),
                "score": float(scores[i]),
                "row_data": serialized_row,
                "drivers": drivers
            })

    # Sort anomalous rows by score descending
    anomalous_rows.sort(key=lambda x: x["score"], reverse=True)

    return anomalous_rows