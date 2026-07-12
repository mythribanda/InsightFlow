"""
Hyperparameter tuning module: Grid Search and Random Search wrappers
around LeakageSafePipeline builders from modeling.py.

Each search function:
  - Accepts a pre-built pipeline (already column-typed from modeling.py)
  - Applies sklearn's GridSearchCV or RandomizedSearchCV over a param grid
  - Returns best_params, best_score, n_candidates, and cv_results_summary
  - All param keys follow the sklearn Pipeline convention: "model__<param>"

Scoring convention
------------------
Classification tasks use "roc_auc" (binary) or "roc_auc_ovr_weighted" (multi-class).
Regression tasks use "r2".
Both are "higher is better", so `best_score_` from the searcher is directly comparable
against the baseline score from evaluate_model_cv.

Windows n_jobs gate
-------------------
GridSearchCV and RandomizedSearchCV are gated to n_jobs=1 on win32 to avoid the
OpenMP / joblib multiprocessing deadlock that affects sklearn on Windows.
"""

import sys
import time
import warnings
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV, StratifiedKFold, KFold
from sklearn.pipeline import Pipeline

# ---------------------------------------------------------------------------
# Default parameter grids — all keys prefixed with "model__" to match the
# pipeline step name used in LeakageSafePipeline builders.
# ---------------------------------------------------------------------------
DEFAULT_PARAM_GRIDS: Dict[str, Dict[str, List[Any]]] = {
    "baseline": {
        # LogisticRegression / LinearRegression
        # LinearRegression has no meaningful hyperparams; grid only applies when
        # task == "classification" (LogisticRegression).
        "model__C": [0.01, 0.1, 1.0, 10.0, 100.0],
        "model__solver": ["lbfgs", "saga"],
        "model__max_iter": [500, 1000, 2000],
    },
    "histgradientboosting": {
        "model__max_iter": [50, 100, 200],
        "model__max_depth": [3, 5, None],
        "model__learning_rate": [0.05, 0.1, 0.2],
        "model__min_samples_leaf": [10, 20, 50],
    },
    "randomforest": {
        "model__n_estimators": [50, 100, 200],
        "model__max_depth": [None, 5, 10, 20],
        "model__min_samples_split": [2, 5, 10],
        "model__max_features": ["sqrt", "log2"],
    },
    "svm": {
        "model__C": [0.1, 1.0, 10.0, 100.0],
        "model__gamma": ["scale", "auto"],
        "model__kernel": ["rbf", "linear"],
    },
    "knn": {
        "model__n_neighbors": [3, 5, 7, 11, 15],
        "model__weights": ["uniform", "distance"],
        "model__metric": ["euclidean", "manhattan"],
    },
    "catboost": {
        "model__iterations": [50, 100, 200],
        "model__learning_rate": [0.05, 0.1, 0.2],
        "model__depth": [4, 6, 8],
    },
}

# ---------------------------------------------------------------------------
# Scoring helper
# ---------------------------------------------------------------------------

def _get_scoring(task: str, y: pd.Series) -> str:
    """Return the sklearn scoring string for a given task."""
    if task == "classification":
        n_classes = y.dropna().nunique()
        return "roc_auc" if n_classes == 2 else "roc_auc_ovr_weighted"
    return "r2"


def _make_cv(task: str, y: pd.Series, cv_splits: int):
    """Return the appropriate CV splitter (StratifiedKFold for classification)."""
    if task == "classification":
        class_counts = y.value_counts()
        if (class_counts < cv_splits).any():
            return KFold(n_splits=cv_splits, shuffle=True, random_state=42)
        return StratifiedKFold(n_splits=cv_splits, shuffle=True, random_state=42)
    return KFold(n_splits=cv_splits, shuffle=True, random_state=42)


def _safe_n_jobs() -> int:
    """n_jobs=1 on Windows to prevent OpenMP deadlock; -1 (all cores) on Linux/macOS."""
    return 1 if sys.platform == "win32" else -1


def _cv_results_summary(cv_results: Dict[str, Any], top_n: int = 5) -> List[Dict[str, Any]]:
    """
    Condense sklearn cv_results_ into the top-N candidates by mean_test_score.
    Returns a list of dicts with params + mean_score + std_score.
    """
    n = len(cv_results["mean_test_score"])
    ranks = cv_results.get("rank_test_score", list(range(1, n + 1)))
    rows = []
    for i in range(n):
        rows.append({
            "rank": int(ranks[i]),
            "params": cv_results["params"][i],
            "mean_score": float(cv_results["mean_test_score"][i]),
            "std_score": float(cv_results["std_test_score"][i]),
        })
    rows.sort(key=lambda r: r["rank"])
    return rows[:top_n]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_grid_search(
    pipeline: Pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    task: str,
    model_key: str,
    param_grid: Optional[Dict[str, List[Any]]] = None,
    cv_splits: int = 5,
) -> Dict[str, Any]:
    """
    Exhaustive grid search over a param grid.

    Parameters
    ----------
    pipeline   : Unfitted LeakageSafePipeline (fresh, not yet .fit()).
    X          : Feature matrix.
    y          : Target vector.
    task       : "classification" | "regression".
    model_key  : Registry key (e.g. "histgradientboosting") — used to resolve
                 the default param grid when param_grid is None.
    param_grid : Optional override.  Must use "model__<param>" prefix convention.
    cv_splits  : Number of CV folds (default 5).

    Returns
    -------
    dict with keys:
      best_params, best_score, n_candidates, search_duration_s, cv_results_summary
    """
    grid = param_grid if param_grid is not None else DEFAULT_PARAM_GRIDS.get(model_key, {})
    if not grid:
        raise ValueError(
            f"No default param grid for model_key='{model_key}' and no param_grid was provided."
        )

    scoring = _get_scoring(task, y)
    cv = _make_cv(task, y, cv_splits)

    # For multi-class roc_auc_ovr_weighted, need predict_proba — already guaranteed by builders.
    searcher = GridSearchCV(
        estimator=pipeline,
        param_grid=grid,
        scoring=scoring,
        cv=cv,
        refit=True,
        n_jobs=_safe_n_jobs(),
        error_score="raise",
    )

    t0 = time.perf_counter()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        searcher.fit(X, y)
    duration = time.perf_counter() - t0

    return {
        "best_params": searcher.best_params_,
        "best_score": float(searcher.best_score_),
        "n_candidates": len(searcher.cv_results_["params"]),
        "search_duration_s": round(duration, 3),
        "cv_results_summary": _cv_results_summary(searcher.cv_results_),
        "fitted_pipeline": searcher.best_estimator_,
    }


def run_random_search(
    pipeline: Pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    task: str,
    model_key: str,
    param_grid: Optional[Dict[str, List[Any]]] = None,
    n_iter: int = 20,
    cv_splits: int = 5,
) -> Dict[str, Any]:
    """
    Randomised hyperparameter search.

    Parameters
    ----------
    n_iter  : Number of random parameter combinations to try (default 20).
              Capped to total grid size when smaller than the grid.

    All other params: see run_grid_search.
    """
    grid = param_grid if param_grid is not None else DEFAULT_PARAM_GRIDS.get(model_key, {})
    if not grid:
        raise ValueError(
            f"No default param grid for model_key='{model_key}' and no param_grid was provided."
        )

    scoring = _get_scoring(task, y)
    cv = _make_cv(task, y, cv_splits)

    searcher = RandomizedSearchCV(
        estimator=pipeline,
        param_distributions=grid,
        n_iter=n_iter,
        scoring=scoring,
        cv=cv,
        refit=True,
        n_jobs=_safe_n_jobs(),
        random_state=42,
        error_score="raise",
    )

    t0 = time.perf_counter()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        searcher.fit(X, y)
    duration = time.perf_counter() - t0

    return {
        "best_params": searcher.best_params_,
        "best_score": float(searcher.best_score_),
        "n_candidates": len(searcher.cv_results_["params"]),
        "search_duration_s": round(duration, 3),
        "cv_results_summary": _cv_results_summary(searcher.cv_results_),
        "fitted_pipeline": searcher.best_estimator_,
    }
