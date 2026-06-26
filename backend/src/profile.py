import pandas as pd
import numpy as np
import datetime
import re
from typing import Dict, Any, List

DATE_REGEX = re.compile(
    r"^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})"
)

def is_numeric_like(val) -> bool:
    if pd.isna(val) or val == "":
        return False
    try:
        float(str(val).replace(",", "").strip())
        return True
    except ValueError:
        return False

def is_bool_like(val) -> bool:
    if pd.isna(val) or val == "":
        return False
    s = str(val).lower().strip()
    return s in ["true", "false", "yes", "no", "y", "n", "0", "1"]

def is_date_like(val) -> bool:
    if pd.isna(val) or val == "":
        return False
    if isinstance(val, (pd.Timestamp, datetime.date, datetime.datetime)):
        return True
    s = str(val).strip()
    if DATE_REGEX.match(s) or ("T" in s and ":" in s):
        try:
            pd.to_datetime(s)
            return True
        except Exception:
            pass
    return False

def infer_column_type(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    
    non_null = series.dropna()
    non_null = non_null[non_null != ""]
    if non_null.empty:
        return "text"
        
    sample = non_null.head(200)
    nums = 0
    dates = 0
    bools = 0
    
    for val in sample:
        if is_numeric_like(val):
            nums += 1
        elif is_date_like(val):
            dates += 1
        elif is_bool_like(val):
            bools += 1
            
    n = len(sample)
    if dates / n > 0.7:
        return "datetime"
    if nums / n > 0.85:
        return "numeric"
    if bools / n > 0.9:
        return "boolean"
        
    n_unique = non_null.nunique()
    non_null_len = len(non_null)
    if non_null_len > 20 and n_unique / non_null_len > 0.95:
        return "id"
    if n_unique <= max(20, int(non_null_len * 0.1)):
        return "categorical"
    return "text"

def is_free_text_column(series: pd.Series, sample_size: int = 200) -> bool:
    non_null = series.dropna().astype(str)
    if len(non_null) == 0:
        return False
    sample = non_null.head(sample_size)
    avg_word_count = sample.str.split().str.len().mean()
    unique_ratio = series.nunique() / len(series) if len(series) > 0 else 0
    # Free text: meaningfully long values AND high uniqueness (not a small fixed category set)
    return avg_word_count >= 4 and unique_ratio > 0.5

def profile_column(name: str, series: pd.Series) -> Dict[str, Any]:
    count = len(series)
    missing = int(series.isna().sum()) + int((series == "").sum())
    non_null_series = series.dropna()
    non_null_series = non_null_series[non_null_series != ""]
    n_unique = int(non_null_series.nunique())
    
    dtype = infer_column_type(series)
    
    missing_pct = (missing / count) * 100 if count else 0.0
    unique_pct = (n_unique / len(non_null_series)) * 100 if not non_null_series.empty else 0.0
    
    profile = {
        "name": name,
        "type": dtype,
        "count": count,
        "missing": missing,
        "missingPct": missing_pct,
        "unique": n_unique,
        "uniquePct": unique_pct,
        "constant": n_unique <= 1 and not non_null_series.empty,
        "highCardinality": n_unique > 50 and unique_pct > 50.0,
        "isFreeText": bool(is_free_text_column(series)),
        "is_free_text": bool(is_free_text_column(series)),
    }
    
    if dtype == "numeric":
        nums_series = pd.to_numeric(
            non_null_series.astype(str).str.replace(",", "").str.strip(),
            errors="coerce"
        ).dropna()
        
        if not nums_series.empty:
            q1 = float(nums_series.quantile(0.25))
            q3 = float(nums_series.quantile(0.75))
            iqr = q3 - q1
            lo = q1 - 1.5 * iqr
            hi = q3 + 1.5 * iqr
            outliers = int(((nums_series < lo) | (nums_series > hi)).sum())
            
            profile.update({
                "min": float(nums_series.min()),
                "max": float(nums_series.max()),
                "mean": float(nums_series.mean()),
                "median": float(nums_series.median()),
                "std": float(nums_series.std()) if len(nums_series) > 1 else 0.0,
                "q1": q1,
                "q3": q3,
                "outliers": outliers,
                "zeros": int((nums_series == 0).sum()),
                "negatives": int((nums_series < 0).sum()),
            })
    elif dtype in ["categorical", "boolean", "text"]:
        counts = non_null_series.value_counts().head(8)
        profile["topValues"] = [
            {"value": str(val), "count": int(count)}
            for val, count in counts.items()
        ]
    elif dtype == "datetime":
        try:
            dates = pd.to_datetime(non_null_series, errors="coerce").dropna()
            if not dates.empty:
                profile.update({
                    "minDate": dates.min().isoformat(),
                    "maxDate": dates.max().isoformat(),
                })
        except Exception:
            pass
            
    return profile

def profile_dataset(df: pd.DataFrame) -> List[Dict[str, Any]]:
    return [profile_column(str(col), df[col]) for col in df.columns]
