"""
Hyperparameter tuning router.

POST /tune/{session_id}
  Runs GridSearchCV or RandomizedSearchCV on an existing session's data
  for a specified model, then stores the best refit pipeline in model_store
  so it can be used with SHAP/export just like any other trained pipeline.

Prerequisites
-------------
The session must have previously called POST /model/{session_id} so that
model_store contains:
  {session_id}_X     – feature DataFrame
  {session_id}_y     – target Series
  {session_id}_task  – "classification" | "regression"
"""

import asyncio
import logging
from functools import partial

from fastapi import APIRouter, HTTPException, Header

from state import model_store, model_results_store, verify_session_owner
from schemas import TuneRequest, TuneResponse
from src.modeling import LeakageSafePipeline, _MODEL_REGISTRY
from src.hyperparameter_tuning import (
    run_grid_search,
    run_random_search,
    DEFAULT_PARAM_GRIDS,
    _get_scoring,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Map canonical model names (as returned by train_models) → registry key.
# This lets the request body say "HistGradientBoostingClassifier" and we
# resolve it to "histgradientboosting" for the param grid lookup.
# ---------------------------------------------------------------------------
_NAME_TO_KEY: dict = {}
for _key, (_builder, _clf, _reg) in _MODEL_REGISTRY.items():
    _NAME_TO_KEY[_clf.lower()] = _key
    _NAME_TO_KEY[_reg.lower()] = _key
    _NAME_TO_KEY[_key] = _key  # also accept the key itself directly


def _resolve_key(model_name: str) -> str:
    """Resolve a model name or registry key to a canonical registry key."""
    return _NAME_TO_KEY.get(model_name.strip().lower(), "")


@router.post("/tune/{session_id}", response_model=TuneResponse)
async def tune_hyperparameters(
    session_id: str,
    request: TuneRequest,
    x_user_id: str = Header(None),
) -> TuneResponse:
    """
    Run hyperparameter search for a specific model on an existing session.

    The tuned pipeline is stored in model_store under:
        {session_id}_tuned_{model_key}
    It is also mirrored to:
        {session_id}_tuned_{model_key}_X
        {session_id}_tuned_{model_key}_y
        {session_id}_tuned_{model_key}_task
    so SHAP analysis can reference it by updating its pipeline key lookup.
    """
    verify_session_owner(session_id, x_user_id)
    try:
        logger.info(
            f"[{session_id}] Tune request: model={request.model_name} "
            f"search={request.search_type} n_iter={request.n_iter}"
        )

        # ── 1. Retrieve session data ──────────────────────────────────────
        X = model_store.get(f"{session_id}_X")
        y = model_store.get(f"{session_id}_y")
        task = model_store.get(f"{session_id}_task")

        if X is None or y is None or task is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No trained model found for this session. "
                    "Call POST /model/{session_id} first."
                ),
            )

        # ── 2. Resolve model key ──────────────────────────────────────────
        model_key = _resolve_key(request.model_name)
        if not model_key or model_key not in _MODEL_REGISTRY:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown model '{request.model_name}'. "
                    f"Supported values: {list(_MODEL_REGISTRY.keys())} "
                    f"or their full class names (e.g. 'HistGradientBoostingClassifier')."
                ),
            )

        # ── 3. Validate search_type ───────────────────────────────────────
        search_type = request.search_type.strip().lower()
        if search_type not in ("grid", "random"):
            raise HTTPException(
                status_code=400,
                detail="search_type must be 'grid' or 'random'.",
            )

        # ── 4. Build a fresh pipeline ─────────────────────────────────────
        builder, _clf_name, _reg_name = _MODEL_REGISTRY[model_key]
        pipeline = builder(X, y, task)

        # ── 5. Resolve param grid ─────────────────────────────────────────
        # User-supplied param_grid overrides defaults entirely (not merged),
        # so the caller has full control when they provide one.
        param_grid = request.param_grid or DEFAULT_PARAM_GRIDS.get(model_key)
        if not param_grid:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No default param grid available for '{model_key}' "
                    "and no param_grid was provided in the request."
                ),
            )

        # ── 6. Run search (offloaded to threadpool – non-blocking) ────────
        loop = asyncio.get_event_loop()

        if search_type == "grid":
            search_fn = partial(
                run_grid_search,
                pipeline=pipeline,
                X=X,
                y=y,
                task=task,
                model_key=model_key,
                param_grid=param_grid,
                cv_splits=request.cv_splits,
            )
        else:
            search_fn = partial(
                run_random_search,
                pipeline=pipeline,
                X=X,
                y=y,
                task=task,
                model_key=model_key,
                param_grid=param_grid,
                n_iter=request.n_iter,
                cv_splits=request.cv_splits,
            )

        logger.info(f"[{session_id}] Starting {search_type} search for '{model_key}'…")
        result = await loop.run_in_executor(None, search_fn)
        logger.info(
            f"[{session_id}] Search complete: best_score={result['best_score']:.4f} "
            f"n_candidates={result['n_candidates']} duration={result['search_duration_s']}s"
        )

        # ── 7. Store tuned pipeline ───────────────────────────────────────
        tuned_key = f"{session_id}_tuned_{model_key}"
        fitted_pipeline = result.pop("fitted_pipeline")
        model_store[tuned_key] = fitted_pipeline
        model_store[f"{tuned_key}_X"] = X
        model_store[f"{tuned_key}_y"] = y
        model_store[f"{tuned_key}_task"] = task

        logger.info(f"[{session_id}] Tuned pipeline stored under '{tuned_key}'")

        # ── 8. Retrieve baseline score for comparison ─────────────────────
        baseline_score: float | None = None
        stored_results = model_results_store.get(session_id)
        scoring_metric = _get_scoring(task, y)

        if stored_results:
            primary_metric = "roc_auc" if task == "classification" else "r2"
            for r in stored_results.get("results", []):
                # Match by the model display name (e.g. "HistGradientBoostingClassifier")
                display_name = (_clf_name if task == "classification" else _reg_name).lower()
                if r.get("model", "").lower() == display_name:
                    baseline_score = r.get("metrics", {}).get(primary_metric)
                    break

        return TuneResponse(
            model_name=request.model_name,
            search_type=search_type,
            best_params=result["best_params"],
            best_score=result["best_score"],
            baseline_score=baseline_score,
            scoring_metric=scoring_metric,
            n_candidates=result["n_candidates"],
            search_duration_s=result["search_duration_s"],
            cv_results_summary=result["cv_results_summary"],
            tuned_pipeline_key=tuned_key,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Tuning error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Hyperparameter tuning failed: {str(e)}")
