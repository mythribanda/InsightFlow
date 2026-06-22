import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple, List

def get_outlier_rate(df: pd.DataFrame, numeric_cols: List[str]) -> float:
    if not numeric_cols:
        return 0.0
    total_outliers = 0
    total_numeric_values = 0
    for col in numeric_cols:
        series = pd.to_numeric(
            df[col].dropna().astype(str).str.replace(",", "").str.strip(),
            errors="coerce"
        ).dropna()
        if series.empty:
            continue
        q1 = float(series.quantile(0.25))
        q3 = float(series.quantile(0.75))
        iqr = q3 - q1
        lo = q1 - 1.5 * iqr
        hi = q3 + 1.5 * iqr
        outliers = int(((series < lo) | (series > hi)).sum())
        total_outliers += outliers
        total_numeric_values += len(series)
    return total_outliers / total_numeric_values if total_numeric_values > 0 else 0.0

def get_consistency_score(df: pd.DataFrame) -> Tuple[float, str]:
    violations = 0
    total_checks = 0
    notes = []
    
    for col in df.columns:
        col_lower = str(col).lower()
        non_null = df[col].dropna()
        if non_null.empty:
            continue
            
        # Age check
        if "age" in col_lower:
            nums = pd.to_numeric(non_null, errors="coerce").dropna()
            if not nums.empty:
                viols = int(((nums < 0) | (nums > 120)).sum())
                violations += viols
                total_checks += len(nums)
                if viols > 0:
                    notes.append(f"'{col}' has {viols} values outside [0, 120]")
                    
        # Percentage check
        elif any(x in col_lower for x in ["percent", "pct", "%", "rate"]):
            nums = pd.to_numeric(non_null, errors="coerce").dropna()
            if not nums.empty:
                viols = int(((nums < 0) | (nums > 100)).sum())
                violations += viols
                total_checks += len(nums)
                if viols > 0:
                    notes.append(f"'{col}' has {viols} values outside [0, 100]")
                    
        # Positive values check
        elif any(x in col_lower for x in ["price", "amount", "cost", "salary", "revenue"]):
            nums = pd.to_numeric(non_null, errors="coerce").dropna()
            if not nums.empty:
                viols = int((nums < 0).sum())
                violations += viols
                total_checks += len(nums)
                if viols > 0:
                    notes.append(f"'{col}' has {viols} negative values")
                    
    if total_checks == 0:
        return 1.0, "All checks passed"
    
    violation_rate = violations / total_checks
    note = "; ".join(notes) if notes else "All checks passed"
    return 1.0 - violation_rate, note

def compute_trust_score(df: pd.DataFrame, numeric_cols: List[str]) -> Tuple[int, List[Dict[str, Any]]]:
    # 1. Completeness
    completeness = float(1.0 - df.isna().mean().mean()) if not df.empty else 1.0
    completeness_score = completeness * 100
    
    # 2. Uniqueness
    dup_rate = float(df.duplicated().mean()) if len(df) > 1 else 0.0
    uniqueness_score = (1.0 - dup_rate) * 100
    
    # 3. Structure
    n_const = sum(df[col].dropna().nunique() <= 1 for col in df.columns) if len(df.columns) > 0 else 0
    const_rate = n_const / len(df.columns) if len(df.columns) > 0 else 0.0
    structure_score = (1.0 - const_rate) * 100
    
    # 4. Stability (based on outlier rate)
    outlier_rate = get_outlier_rate(df, numeric_cols)
    stability_score = (1.0 - outlier_rate) * 100
    
    # 5. Consistency
    consistency, consistency_note = get_consistency_score(df)
    consistency_score = consistency * 100
    
    # Formula from §6:
    score = (
        0.30 * completeness_score +
        0.25 * uniqueness_score +
        0.20 * structure_score +
        0.15 * consistency_score +
        0.10 * stability_score
    )
    
    rounded_score = int(round(max(0.0, min(100.0, score))))
    
    breakdown = [
        {
            "label": "Completeness",
            "score": float(completeness_score),
            "weight": 0.30,
            "note": f"{(1.0 - completeness)*100:.1f}% missing cells"
        },
        {
            "label": "Uniqueness",
            "score": float(uniqueness_score),
            "weight": 0.25,
            "note": f"{dup_rate*100:.1f}% duplicate rows"
        },
        {
            "label": "Structure",
            "score": float(structure_score),
            "weight": 0.20,
            "note": f"{n_const} constant columns"
        },
        {
            "label": "Consistency",
            "score": float(consistency_score),
            "weight": 0.15,
            "note": consistency_note
        },
        {
            "label": "Stability",
            "score": float(stability_score),
            "weight": 0.10,
            "note": f"{outlier_rate*100:.1f}% outlier values"
        }
    ]
    
    return rounded_score, breakdown
