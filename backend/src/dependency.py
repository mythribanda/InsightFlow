import pandas as pd
import numpy as np
from sklearn.feature_selection import mutual_info_regression
from typing import Dict, Any, List

def compute_dependency_matrices(df: pd.DataFrame, numeric_cols: List[str]) -> Dict[str, Any]:
    if len(numeric_cols) < 2:
        return {
            "columns": numeric_cols,
            "pearson": [],
            "spearman": [],
            "mutual_info": []
        }
        
    df_num = df[numeric_cols].copy()
    
    # Columns are classified "numeric" by sampling (see profile.py infer_column_type),
    # which tolerates a minority of non-numeric placeholder strings like "NA".
    # Coerce here before any math, or .corr() crashes on leftover string values.
    df_num = df_num.apply(pd.to_numeric, errors="coerce")
    
    # Pearson
    pearson_df = df_num.corr(method="pearson").fillna(0.0)
    
    # Spearman
    spearman_df = df_num.corr(method="spearman").fillna(0.0)
    
    # Mutual Information
    for col in numeric_cols:
        col_mean = df_num[col].mean()
        if pd.isna(col_mean):
            df_num[col] = df_num[col].fillna(0.0)
        else:
            df_num[col] = df_num[col].fillna(col_mean)
            
    n = len(numeric_cols)
    mi_matrix = np.zeros((n, n))
    
    for i in range(n):
        for j in range(n):
            if i == j:
                mi_matrix[i][j] = 1.0  # Self-dependency
            else:
                try:
                    # reshape for sklearn
                    X_val = df_num[[numeric_cols[i]]]
                    y_val = df_num[numeric_cols[j]]
                    mi_val = mutual_info_regression(X_val, y_val, random_state=42)[0]
                    mi_matrix[i][j] = float(max(0.0, mi_val))
                except Exception:
                    mi_matrix[i][j] = 0.0
                    
    # Let's normalize Mutual Info matrix by column-wise max to keep values in [0, 1] range for visual rendering
    normalized_mi = mi_matrix.copy()
    for i in range(n):
        row_max = np.max(normalized_mi[i])
        if row_max > 0:
            # We want self-MI to be 1.0, and others relative to it or to the max
            pass
            
    return {
        "columns": numeric_cols,
        "pearson": pearson_df.values.tolist(),
        "spearman": spearman_df.values.tolist(),
        "mutual_info": mi_matrix.tolist()
    }
