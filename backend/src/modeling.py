"""
Modeling module (§4): Task detection, leakage scanning, leakage-safe pipelines, and model training.
Follows CURATED ML pipeline design with emphasis on avoiding data leakage via per-fold refitting.
"""

import warnings
from typing import Dict, List, Tuple, Any, Optional
import numpy as np
import pandas as pd
from dataclasses import dataclass

# sklearn
from sklearn.model_selection import StratifiedKFold, KFold, cross_val_score
from sklearn.feature_selection import mutual_info_regression, mutual_info_classif
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import (
    mean_absolute_error, mean_squared_error, r2_score, mean_absolute_percentage_error,
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, balanced_accuracy_score
)



@dataclass
class LeakageFlag:
    """Represents a flagged leakage risk."""
    column: str
    reason: str
    score: Optional[float] = None

@dataclass
class ModelResult:
    """Single model evaluation result across CV folds."""
    model_name: str
    metrics: Dict[str, float]
    std: Dict[str, float]
    fold_scores: Dict[str, List[float]]

@dataclass
class ModelingOutput:
    """Complete output of the modeling pipeline."""
    task: str
    leakage_flags: List[Dict[str, Any]]
    results: List[Dict[str, Any]]
    best: Dict[str, Any]
    class_imbalance: Dict[str, Any]  # {majority_share, imbalanced, message}

class TaskDetector:
    """§4.1: Task Detection — classify as regression vs. classification."""
    
    @staticmethod
    def detect(y: pd.Series) -> str:
        """
        Detect task type from target variable.
        If numeric and has more than 20 unique values, it is regression.
        Otherwise, it is classification.
        """
        y_clean = y.dropna()
        if y_clean.empty:
            return "classification"
        
        # Check if float or int and unique > 20
        if y_clean.dtype.kind in "if" and y_clean.nunique() > 20:
            return "regression"
        return "classification"

class LeakageScan:
    """§4.2: Leakage Scan — detect single-feature leakage + structural giveaways."""
    
    @staticmethod
    def encode_single(df_col: pd.DataFrame) -> np.ndarray:
        """Helper to impute and encode a single column for leakage scanning."""
        col_name = df_col.columns[0]
        series = df_col[col_name]
        
        if pd.api.types.is_numeric_dtype(series):
            # Impute numeric with median
            imputed = series.fillna(series.median() if not series.isna().all() else 0.0)
            return imputed.values.reshape(-1, 1)
        else:
            # Impute categorical with mode
            mode_val = series.mode().iloc[0] if not series.mode().empty else "MISSING"
            imputed = series.fillna(mode_val)
            # One-hot encode
            encoded = pd.get_dummies(imputed, drop_first=True)
            return encoded.values

    @staticmethod
    def scan(
        X: pd.DataFrame,
        y: pd.Series,
        task: str,
        cv_splits: int = 5
    ) -> List[LeakageFlag]:
        """
        Scan every feature column for leakage risk using three independent detection loops.
        Flags are deduplicated per column; the first loop to fire for a column wins.

        Loop 1 — Single-feature CV score (lines ~127-176):
            Trains HistGradientBoosting on each feature alone using k-fold CV.
            Flags if mean CV R² > 0.95 (regression) or AUC/accuracy > 0.97 (classification).
            Catches: near-direct numeric copies of the target (e.g. target + tiny noise).
            Misses: discretised/binned encodings whose CV R² sits below the threshold (~0.6-0.85).

        Loop 2 — Structural giveaways (lines ~179-201):
            Flags ID-like columns (nunique / n_rows >= 0.95) and near-perfect Pearson
            correlation with target (|r| > 0.98, numeric features only).
            Catches: row identifiers combined with the target; near-linear transformations.

        Loop 3 — Mutual information for categorical features (lines ~203-261):
            Computes sklearn mutual_info_regression/classif on OHE of each categorical column.
            Normalises MI by H(y) to get a scale-free ratio; flags if normalised MI > 0.90.
            Catches: binned/quantised target encodings that loop 1 misses (e.g. pd.qcut(y, 5)).
            Only runs on non-numeric columns; numeric columns are covered by loops 1 and 2.
        """
        flags = []
        n_samples = len(X)
        
        if n_samples < cv_splits:
            return []
            
        cv = StratifiedKFold(cv_splits, shuffle=True, random_state=42) if task == "classification" else KFold(cv_splits, shuffle=True, random_state=42)
        
        # 1. Single-feature CV scan
        for col in X.columns:
            Xi = LeakageScan.encode_single(X[[col]])
            if Xi.shape[1] == 0:
                continue
                
            if task == "classification":
                try:
                    # Use ROC-AUC for binary classification, otherwise fallback to accuracy
                    n_classes = y.dropna().nunique()
                    if n_classes == 2:
                        scores = cross_val_score(
                            HistGradientBoostingClassifier(random_state=42),
                            Xi, y, cv=cv, scoring="roc_auc"
                        )
                        mean_score = float(np.mean(scores))
                        if mean_score > 0.97:
                            flags.append(LeakageFlag(
                                column=col,
                                reason=f"Single-feature CV ROC-AUC {mean_score:.2f} is suspiciously high (> 0.97)",
                                score=mean_score
                            ))
                    else:
                        scores = cross_val_score(
                            HistGradientBoostingClassifier(random_state=42),
                            Xi, y, cv=cv, scoring="accuracy"
                        )
                        mean_score = float(np.mean(scores))
                        if mean_score > 0.97:
                            flags.append(LeakageFlag(
                                column=col,
                                reason=f"Single-feature CV Accuracy {mean_score:.2f} is suspiciously high (> 0.97)",
                                score=mean_score
                            ))
                except Exception:
                    pass
            else:
                try:
                    scores = cross_val_score(
                        HistGradientBoostingRegressor(random_state=42),
                        Xi, y, cv=cv, scoring="r2"
                    )
                    mean_score = float(np.mean(scores))
                    if mean_score > 0.95:
                        flags.append(LeakageFlag(
                            column=col,
                            reason=f"Single-feature CV R² {mean_score:.2f} is suspiciously high (> 0.95)",
                            score=mean_score
                        ))
                except Exception:
                    pass
        
        # 2. Structural giveaways
        for col in X.columns:
            # ID-like columns (near-unique values)
            nunique = X[col].nunique()
            if n_samples > 5 and nunique / n_samples >= 0.95:
                flags.append(LeakageFlag(
                    column=col,
                    reason=f"ID-like: near-unique column ({nunique} unique values out of {n_samples} rows)"
                ))
                continue
                
            # Near-perfect correlation with target
            if pd.api.types.is_numeric_dtype(X[col]) and pd.api.types.is_numeric_dtype(y):
                try:
                    corr = float(X[col].corr(y))
                    if abs(corr) > 0.98:
                        flags.append(LeakageFlag(
                            column=col,
                            reason=f"Near-perfect correlation with target: {corr:.3f}",
                            score=corr
                        ))
                except Exception:
                    pass

        # 3. Mutual-information check for categorical features
        # Catches discretised/binned target leakage that the CV-score path misses
        # because a k-bin qcut feature has single-feature R² ≈ 0.6-0.85, below the
        # 0.95 CV threshold, yet carries high mutual information with the target.
        # We use normalised MI (MI / H(y_discretised)) so the threshold is scale-free.
        # Threshold: normalised MI > 0.90 is flagged as suspiciously high.
        MI_THRESHOLD = 0.90
        for col in X.columns:
            if pd.api.types.is_numeric_dtype(X[col]):
                continue  # numeric columns are covered by CV-score and correlation checks
            try:
                series = X[col].astype(str).fillna("__missing__")
                Xi_cat = pd.get_dummies(series, drop_first=False).values.astype(float)
                if Xi_cat.shape[1] == 0:
                    continue

                y_clean = y.copy()
                valid_mask = ~y_clean.isna()
                Xi_cat = Xi_cat[valid_mask]
                y_clean = y_clean[valid_mask]

                if len(y_clean) < cv_splits:
                    continue

                if task == "regression":
                    mi_scores = mutual_info_regression(
                        Xi_cat, y_clean, random_state=42
                    )
                else:
                    mi_scores = mutual_info_classif(
                        Xi_cat, y_clean, random_state=42
                    )

                mi_total = float(np.sum(mi_scores))

                # Normalise: compute entropy of y to get a scale-free ratio.
                # For regression: discretise y into 10 bins to estimate H(y).
                if task == "regression":
                    y_binned = pd.cut(y_clean, bins=10, labels=False, duplicates="drop")
                    _, counts = np.unique(y_binned.dropna(), return_counts=True)
                else:
                    _, counts = np.unique(y_clean, return_counts=True)
                probs = counts / counts.sum()
                h_y = float(-np.sum(probs * np.log(probs + 1e-12)))

                if h_y > 0:
                    norm_mi = mi_total / h_y
                    if norm_mi > MI_THRESHOLD:
                        flags.append(LeakageFlag(
                            column=col,
                            reason=(
                                f"High mutual information with target: normalised MI={norm_mi:.2f} "
                                f"(>{MI_THRESHOLD}) — feature may encode target information "
                                f"(e.g. binned or categorised target)"
                            ),
                            score=norm_mi
                        ))
            except Exception:
                pass

        # Deduplicate — first occurrence per column wins.
        # Loop 1 (CV-score) runs before loop 2 (structural) before loop 3 (MI),
        # so if multiple paths fire for the same column, the CV-score reason survives.
        seen = set()
        unique_flags = []
        for flag in flags:
            if flag.column not in seen:
                unique_flags.append(flag)
                seen.add(flag.column)
                
        return unique_flags

class LeakageSafePipeline:
    """§4.3: Leakage-Safe Pipeline — all preprocessing inside ColumnTransformer for per-fold refitting."""
    
    @staticmethod
    def build_pipeline(X_sample: pd.DataFrame, y_sample: pd.Series, task: str) -> Pipeline:
        """Builds a pipeline with standard preprocessors and a baseline model."""
        numeric_cols = X_sample.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = X_sample.select_dtypes(exclude=[np.number]).columns.tolist()
        
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
        
        import sys
        # Gated to n_jobs=1 on Windows due to OpenMP/joblib duplicate runtime deadlock, -1 (max parallel) on Linux
        n_jobs_val = 1 if sys.platform == "win32" else -1
        
        if task == "classification":
            estimator = LogisticRegression(random_state=42, max_iter=1000, n_jobs=n_jobs_val)
        else:
            estimator = LinearRegression(n_jobs=n_jobs_val)
            
        return Pipeline([
            ("preprocessor", preprocessor),
            ("model", estimator)
        ])

    @staticmethod
    def build_boosting_pipeline(X_sample: pd.DataFrame, y_sample: pd.Series, task: str) -> Pipeline:
        """Builds a pipeline with HistGradientBoosting."""
        numeric_cols = X_sample.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = X_sample.select_dtypes(exclude=[np.number]).columns.tolist()
        
        transformers = []
        # HistGradientBoosting natively handles missing numeric values, but we still impute to be safe.
        if numeric_cols:
            transformers.append(
                ("num", Pipeline([
                    ("imp", SimpleImputer(strategy="median"))
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
        
        if task == "classification":
            estimator = HistGradientBoostingClassifier(random_state=42, max_iter=100)
        else:
            estimator = HistGradientBoostingRegressor(random_state=42, max_iter=100)
            
        return Pipeline([
            ("preprocessor", preprocessor),
            ("model", estimator)
        ])

def evaluate_model_cv(
    pipeline: Pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    task: str,
    cv_splits: int = 5
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, List[float]]]:
    """Evaluates the pipeline using StratifiedKFold or KFold cross-validation."""
    if task == "classification":
        cv = StratifiedKFold(n_splits=cv_splits, shuffle=True, random_state=42)
        metrics_to_compute = ["accuracy", "precision", "recall", "f1", "roc_auc", "balanced_accuracy"]
    else:
        cv = KFold(n_splits=cv_splits, shuffle=True, random_state=42)
        metrics_to_compute = ["mae", "rmse", "r2", "mape"]
        
    fold_scores = {metric: [] for metric in metrics_to_compute}
    
    for train_idx, test_idx in cv.split(X, y if task == "classification" else None):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
        
        # Fit inside fold (leakage-safe)
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)
        
        if task == "classification":
            y_pred_proba = pipeline.predict_proba(X_test)
            fold_scores["accuracy"].append(accuracy_score(y_test, y_pred))
            fold_scores["precision"].append(precision_score(y_test, y_pred, average="weighted", zero_division=0))
            fold_scores["recall"].append(recall_score(y_test, y_pred, average="weighted", zero_division=0))
            fold_scores["f1"].append(f1_score(y_test, y_pred, average="weighted", zero_division=0))
            
            n_classes = len(np.unique(y_test))
            if n_classes == 2:
                fold_scores["roc_auc"].append(roc_auc_score(y_test, y_pred_proba[:, 1]))
            else:
                try:
                    fold_scores["roc_auc"].append(roc_auc_score(y_test, y_pred_proba, multi_class="ovr", average="weighted"))
                except Exception:
                    fold_scores["roc_auc"].append(np.nan)
            fold_scores["balanced_accuracy"].append(balanced_accuracy_score(y_test, y_pred))
        else:
            fold_scores["mae"].append(mean_absolute_error(y_test, y_pred))
            fold_scores["rmse"].append(np.sqrt(mean_squared_error(y_test, y_pred)))
            fold_scores["r2"].append(r2_score(y_test, y_pred))
            
            mask = y_test != 0
            if mask.sum() > 0:
                fold_scores["mape"].append(mean_absolute_percentage_error(y_test[mask], y_pred[mask]))
            else:
                fold_scores["mape"].append(np.nan)
                
    mean_metrics = {}
    std_metrics = {}
    for metric, scores in fold_scores.items():
        scores_clean = [s for s in scores if not np.isnan(s)]
        if scores_clean:
            mean_metrics[metric] = float(np.mean(scores_clean))
            std_metrics[metric] = float(np.std(scores_clean))
        else:
            mean_metrics[metric] = 0.0
            std_metrics[metric] = 0.0
            
    return mean_metrics, std_metrics, fold_scores

def check_class_imbalance(y: pd.Series, task: str) -> Dict[str, Any]:
    """
    Checks for severe class imbalance and returns a structured result dict.

    Returns a dict with:
      - majority_share (float): fraction of the most common class (0.0 for regression)
      - imbalanced (bool): True if majority class > 80% of samples
      - message (str | None): human-readable warning if imbalanced, else None

    The caller (run_modeling_pipeline) passes message to warnings.warn() for server
    logs AND also embeds the full dict in ModelingOutput.class_imbalance so it
    surfaces to the API response. Does NOT modify any metric value or leakage flag.
    Only meaningful for classification; returns imbalanced=False for regression.
    """
    if task != "classification" or len(y) == 0:
        return {"majority_share": 0.0, "imbalanced": False, "message": None}
    val_counts = y.value_counts(normalize=True)
    if val_counts.empty:
        return {"majority_share": 0.0, "imbalanced": False, "message": None}
    majority_share = float(val_counts.iloc[0])
    imbalanced = majority_share > 0.8
    message = (
        f"Class imbalance detected: majority class represents {majority_share*100:.1f}% "
        f"of data. Accuracy is misleading; focus on F1 or balanced accuracy."
        if imbalanced else None
    )
    return {"majority_share": round(majority_share, 4), "imbalanced": imbalanced, "message": message}

def train_models(
    X: pd.DataFrame,
    y: pd.Series,
    task: str,
    excluded_features: Optional[List[str]] = None,
    cv_splits: int = 5
) -> List[ModelResult]:
    """Train exactly 2 models: a linear/logistic baseline and HistGradientBoosting."""
    if excluded_features:
        X = X.drop(columns=[col for col in excluded_features if col in X.columns])
        
    n_samples = len(X)
    if n_samples < 2:
        raise ValueError(f"Dataset must have at least 2 rows to train models (found {n_samples} rows).")
        
    # Dynamically adjust cv_splits if dataset has fewer than 5 samples
    adjusted_cv = cv_splits
    if n_samples < adjusted_cv:
        adjusted_cv = max(2, n_samples)
        
    results = []
    
    # Model 1: Baseline
    pipeline_baseline = LeakageSafePipeline.build_pipeline(X, y, task)
    mean_metrics, std_metrics, fold_scores = evaluate_model_cv(pipeline_baseline, X, y, task, adjusted_cv)
    model_name_baseline = "LogisticRegression" if task == "classification" else "LinearRegression"
    results.append(ModelResult(
        model_name=model_name_baseline,
        metrics=mean_metrics,
        std=std_metrics,
        fold_scores=fold_scores
    ))
    
    # Model 2: HistGradientBoosting
    pipeline_boosting = LeakageSafePipeline.build_boosting_pipeline(X, y, task)
    mean_metrics, std_metrics, fold_scores = evaluate_model_cv(pipeline_boosting, X, y, task, adjusted_cv)
    model_name_boosting = "HistGradientBoostingClassifier" if task == "classification" else "HistGradientBoostingRegressor"
    results.append(ModelResult(
        model_name=model_name_boosting,
        metrics=mean_metrics,
        std=std_metrics,
        fold_scores=fold_scores
    ))
    
    return results

def determine_best_model(results: List[ModelResult], task: str) -> Dict[str, Any]:
    primary_metric = "roc_auc" if task == "classification" else "r2"
    best = None
    best_value = -np.inf
    
    for r in results:
        val = r.metrics.get(primary_metric, -np.inf)
        if val > best_value:
            best = r
            best_value = val
            
    if best is None:
        best = results[0]
        best_value = list(best.metrics.values())[0]
        
    return {
        "model": best.model_name,
        "primary_metric": primary_metric,
        "value": best_value,
        "std": best.std.get(primary_metric, 0.0)
    }

def run_modeling_pipeline(
    X: pd.DataFrame,
    y: pd.Series,
    target_col: str,
    excluded_features: Optional[List[str]] = None,
    cv_splits: int = 5
) -> ModelingOutput:
    """Complete modeling workflow following §4 exactly."""
    # Ensure consistent string representation for categorical/non-numeric columns (preserving NaNs)
    X = X.copy()
    categorical_cols = X.select_dtypes(exclude=[np.number]).columns.tolist()
    for col in categorical_cols:
        X[col] = X[col].map(lambda x: str(x) if pd.notna(x) else x)

    task = TaskDetector.detect(y)
    
    n_samples = len(X)
    if n_samples < 2:
        raise ValueError(f"Dataset must have at least 2 rows to train models (found {n_samples} rows).")
        
    adjusted_cv = cv_splits
    if n_samples < adjusted_cv:
        adjusted_cv = max(2, n_samples)
        
    # Run Leakage scan
    leakage_flags = LeakageScan.scan(X, y, task, cv_splits=adjusted_cv)
    
    # Train both models
    model_results = train_models(X, y, task, excluded_features, adjusted_cv)
    
    results_dict = [
        {
            "model": r.model_name,
            "metrics": r.metrics,
            "std": r.std,
            "fold_scores": r.fold_scores
        }
        for r in model_results
    ]
    
    best = determine_best_model(model_results, task)
    
    # Class imbalance — structured dict returned to caller AND emitted as server warning
    imbalance = check_class_imbalance(y, task)
    if imbalance["imbalanced"] and imbalance["message"]:
        warnings.warn(imbalance["message"])
        
    leakage_dict = [
        {
            "column": flag.column,
            "reason": flag.reason,
            "score": flag.score
        }
        for flag in leakage_flags
    ]
    
    return ModelingOutput(
        task=task,
        leakage_flags=leakage_dict,
        results=results_dict,
        best=best,
        class_imbalance=imbalance
    )
