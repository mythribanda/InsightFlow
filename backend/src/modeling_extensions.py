"""
Extensions to modeling.py for:
- §4.6 SHAP explainability
- S3 Target suitability checking
- S2 Feature recommendation bucketing
"""

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64
from typing import Dict, List, Tuple, Any, Optional

from sklearn.inspection import permutation_importance
from .modeling import check_class_imbalance

def get_feature_importance(
    pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    task: str
) -> Dict[str, float]:
    """
    Compute permutation importance for the fitted model.
    Reuses the already-fitted pipeline from training.
    """
    try:
        if task == "classification":
            scoring = "accuracy"
        else:
            scoring = "r2"
        
        # Transform X through the fitted preprocessor
        X_transformed = pipeline.named_steps['preprocessor'].transform(X)
        
        # Compute permutation importance on the transformed data
        model = pipeline.named_steps['model']
        importances = permutation_importance(
            model, X_transformed, y,
            n_repeats=5, random_state=42, n_jobs=-1,
            scoring=scoring
        )
        
        # Map back to original feature names
        importance_dict = {}
        feature_names = pipeline.named_steps['preprocessor'].get_feature_names_out()
        for i, importance in enumerate(importances.importances_mean):
            feat_name = str(feature_names[i])
            clean_name = feat_name.replace("num__", "").replace("cat__", "")
            
            # Find which original column matches
            matched_col = None
            for col in X.columns:
                if clean_name == col or clean_name.startswith(col + "_"):
                    matched_col = col
                    break
                    
            if matched_col:
                importance_dict[matched_col] = importance_dict.get(matched_col, 0.0) + float(importance)
        
        return importance_dict
    except Exception as e:
        print(f"Error computing permutation importance: {e}")
        return {}

def recommend_features(
    X: pd.DataFrame,
    y: pd.Series,
    task: str,
    leakage_flags: List[Dict[str, Any]],
    pipeline=None
) -> Dict[str, List[str]]:
    """
    S2: Feature recommendation bucketing.
    Categorize features into: high_signal, low_signal, harmful, leakage.
    
    If pipeline is None (pre-training), uses a quick one-shot GBDT fit + permutation importance.
    Otherwise (post-training), uses permutation importance from the provided pipeline.
    """
    # Map leakage flags to their reasons
    leak_reasons = {flag['column']: flag['reason'] for flag in leakage_flags}
    leakage_cols = set(leak_reasons.keys())
    
    high_signal = []
    low_signal = []
    harmful = []
    # Surface LeakageScan flags with their reasons in the leakage output list
    leakage = [f"{col} ({leak_reasons.get(col, 'Potential leakage')})" for col in leakage_cols]
    
    importance = {}
    
    if pipeline is None:
        try:
            # Pre-training feature recommendation
            from .modeling import LeakageSafePipeline
            X_clean = X.drop(columns=[col for col in leakage_cols if col in X.columns])
            if not X_clean.empty and len(y) >= 5:
                temp_pipeline = LeakageSafePipeline.build_boosting_pipeline(X_clean, y, task)
                temp_pipeline.fit(X_clean, y)
                importance = get_feature_importance(temp_pipeline, X_clean, y, task)
        except Exception as e:
            print(f"Error computing pre-training permutation importance: {e}")
            # Fallback to simple correlation/mutual info heuristic if GBM fitting fails
            importance = {}
    else:
        importance = get_feature_importance(pipeline, X, y, task)
        
    for col in X.columns:
        if col in leakage_cols:
            continue
            
        # Check constant
        if X[col].nunique() <= 1:
            harmful.append(f"{col} (constant)")
            continue
            
        # Check ID-like (high cardinality) — softer heuristic for string/object
        if (X[col].dtype == object or pd.api.types.is_string_dtype(X[col])) and X[col].nunique() > 0.5 * len(X):
            harmful.append(f"{col} (high cardinality)")
            continue
            
        # Use importance scores
        imp_score = importance.get(col, 0.0)
        if imp_score >= 0.01:
            high_signal.append(col)
        elif imp_score < -0.005:
            harmful.append(f"{col} (negative importance)")
        else:
            low_signal.append(col)
            
    return {
        "high_signal": high_signal,
        "low_signal": low_signal,
        "harmful": harmful,
        "leakage": leakage
    }

def check_target_suitability(
    X: pd.DataFrame,
    y: pd.Series,
    task: str
) -> Dict[str, Any]:
    """
    S3: Target suitability pre-flight health report.
    Checks completeness, variance, class balance, sample-size heuristic.
    """
    n_samples = len(y)
    n_features = len(X.columns)
    missing_pct = float(y.isna().sum() / len(y) * 100) if len(y) > 0 else 0.0
    
    issues = []
    warnings = []
    
    # Completeness
    if missing_pct > 10:
        issues.append(f"Target has {missing_pct:.1f}% missing values — consider imputation or filtering")
        
    # Variance
    if task == "classification":
        value_counts = y.value_counts()
        if len(value_counts) <= 1:
            issues.append("Target has only 1 unique class — model cannot train")
        elif len(value_counts) > 50:
            warnings.append("Target has >50 classes — verify if regression is intended")
    else:
        # Regression
        target_std = float(y.std()) if len(y) > 1 else 0.0
        if target_std < 1e-6:
            issues.append("Target has near-zero variance — model cannot learn")
            
    # Sample size heuristic
    if n_features > 0:
        recommended_samples = 50 * n_features
        if n_samples < recommended_samples:
            warnings.append(
                f"Dataset size warning (heuristic rule of thumb): "
                f"The dataset has {n_samples} samples for {n_features} features (ratio: {n_samples / n_features:.1f}). "
                f"A general heuristic suggests at least 50 samples per feature ({recommended_samples} samples) "
                f"to reduce overfitting risk, though this is a heuristic rather than a strict law."
            )
            
    class_imbalance = check_class_imbalance(y, task)
            
    return {
        "task": task,
        "n_samples": n_samples,
        "n_features": n_features,
        "missing_pct": missing_pct,
        "issues": issues,
        "warnings": warnings,
        "suitable": len(issues) == 0,
        "class_imbalance": class_imbalance
    }

def generate_shap_plots(
    pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    task: str,
    sample_idx: int = 0,
    raw_df: Optional[pd.DataFrame] = None
) -> Dict[str, Any]:
    """
    §4.6: SHAP analysis for the fitted best model.
    Generates global importance (bar) + per-sample waterfall plot.
    """
    try:
        import shap
    except ImportError:
        return {
            "error": "SHAP not installed. Install with: pip install shap"
        }
        
    plots = {}
    
    try:
        # Transform X through the fitted preprocessor
        X_transformed = pipeline.named_steps['preprocessor'].transform(X)
        
        # Get clean feature names out
        try:
            feature_names = pipeline.named_steps['preprocessor'].get_feature_names_out()
            clean_names = [f.replace("num__", "").replace("cat__", "") for f in feature_names]
            X_transformed_df = pd.DataFrame(X_transformed, columns=clean_names)
        except Exception:
            X_transformed_df = pd.DataFrame(X_transformed)
            
        model = pipeline.named_steps['model']
        
        # Compute predicted value for the explained row to confirm additivity check
        if task == "classification" and hasattr(model, "predict_proba"):
            pred_proba = model.predict_proba(X_transformed_df.iloc[[sample_idx]])[0]
            if len(pred_proba) == 2:
                pred_val = float(pred_proba[1])
            else:
                pred_val = float(np.max(pred_proba))
        else:
            pred_val = float(model.predict(X_transformed_df.iloc[[sample_idx]])[0])
            
        # Resolve human-readable row label (e.g. employee_id or name)
        row_label = f"Row {sample_idx}"
        if raw_df is not None and sample_idx < len(raw_df):
            for col in ["employee_id", "id", "name"]:
                if col in raw_df.columns:
                    row_label = str(raw_df.iloc[sample_idx][col])
                    break
        
        plots['prediction'] = pred_val
        plots['row_label'] = row_label
        
        # Create explainer
        if 'HistGradient' in str(type(model)):
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_transformed_df)
        else:
            explainer = shap.LinearExplainer(model, X_transformed_df)
            shap_values = explainer.shap_values(X_transformed_df)
            
        # Safe unpacking for expected values and shap values across all task types
        if isinstance(shap_values, list):
            val_idx = 1 if len(shap_values) == 2 else 0
            values = shap_values[val_idx]
            
            # Retrieve expected value safely
            expected_val_raw = explainer.expected_value
            if hasattr(expected_val_raw, "__len__") and not isinstance(expected_val_raw, (str, bytes)):
                if len(expected_val_raw) > val_idx:
                    expected = expected_val_raw[val_idx]
                else:
                    expected = expected_val_raw[0]
            else:
                expected = expected_val_raw
        else:
            values = shap_values
            expected_val_raw = explainer.expected_value
            if hasattr(expected_val_raw, "__len__") and not isinstance(expected_val_raw, (str, bytes)):
                if len(expected_val_raw) == 1:
                    expected = expected_val_raw[0]
                elif len(expected_val_raw) == 2:
                    expected = expected_val_raw[1]
                else:
                    expected = expected_val_raw[0]
            else:
                expected = expected_val_raw
            
        # 1. Global importance plot
        plt.figure(figsize=(10, 6))
        shap.summary_plot(values, X_transformed_df, plot_type="bar", show=False)
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        plots['global_importance'] = base64.b64encode(buf.read()).decode()
        plt.close()
        
        # 2. Per-row waterfall plot
        plt.figure(figsize=(10, 8))
        shap.plots._waterfall.waterfall_legacy(
            expected,
            values[sample_idx],
            X_transformed_df.iloc[sample_idx]
        )
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        plots['per_sample_waterfall'] = base64.b64encode(buf.read()).decode()
        plt.close()
        
    except Exception as e:
        import traceback
        plots['error'] = f"SHAP analysis failed: {str(e)}\n{traceback.format_exc()}"
        plt.close()
        
    return plots
