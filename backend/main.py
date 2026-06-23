"""
FastAPI server for InsightFlow modeling pipeline.
Provides endpoints for: target suitability (S3), feature recommendations (S2), 
model training (§4), and SHAP explainability (§4.6).
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import pandas as pd
import io
import json
import logging
import pickle
import os
import numpy as np
import sys
if sys.platform == "win32":
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
    os.environ["NUMEXPR_NUM_THREADS"] = "1"

def parse_request_data(data: Any) -> pd.DataFrame:
    """Parses raw request data into a DataFrame with proper types and missing values."""
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
    
    # Replace empty strings and whitespace-only strings with NaN
    df = df.replace(r'^\s*$', np.nan, regex=True)
    
    # Try to convert each column to numeric if possible
    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col])
        except (ValueError, TypeError):
            pass
            
    return df

from src.modeling import run_modeling_pipeline, TaskDetector, check_class_imbalance
from src.modeling_extensions import (
    check_target_suitability, recommend_features, generate_shap_plots
)
from src.profile import profile_dataset
from src.trust import compute_trust_score
from src.dependency import compute_dependency_matrices
from src.calc_columns import add_calculated_column
from fastapi import BackgroundTasks

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Session store for fitted models (in-memory; use Redis for production)
model_store = {}
# Session store for raw DataFrames (in-memory; cached for downstream tasks like anomalies)
session_data_store = {}

# FastAPI app
app = FastAPI(
    title="InsightFlow - Modeling API",
    description="ML modeling pipeline with leakage detection, feature recommendations, and SHAP explainability",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logger.error(f"Validation error on {request.url.path}: {exc_str}")
    logger.error(f"Request body: {await request.body()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(await request.body())}
    )



class ModelRequest(BaseModel):
    """Request body for /model/{session_id} endpoint."""
    target: str  # Name of target column
    data: Dict[str, Any]  # CSV data as dict or base64-encoded CSV string
    excluded_features: Optional[List[str]] = None
    cv_splits: Optional[int] = 5


class ModelResponse(BaseModel):
    """Response body for modeling endpoint."""
    task: str
    leakage: List[Dict[str, Any]]
    results: List[Dict[str, Any]]
    best: Dict[str, Any]
    class_imbalance: Dict[str, Any]  # {majority_share: float, imbalanced: bool, message: str|None}


class SuitabilityRequest(BaseModel):
    """Request body for /suitability/{session_id} endpoint."""
    target: str
    data: Dict[str, Any]


class SuitabilityResponse(BaseModel):
    """Response for target suitability check (S3)."""
    task: str
    n_samples: int
    n_features: int
    missing_pct: float
    issues: List[str]
    warnings: List[str]
    suitable: bool
    class_imbalance: Dict[str, Any]  # {majority_share: float, imbalanced: bool, message: str|None}


class RecommendationRequest(BaseModel):
    """Request for /recommend/{session_id} endpoint."""
    target: str
    data: Dict[str, Any]


class RecommendationResponse(BaseModel):
    """Response for feature recommendations (S2)."""
    high_signal: List[str]
    low_signal: List[str]
    harmful: List[str]
    leakage: List[str]


class ShapRequest(BaseModel):
    """Request for /shap/{session_id} endpoint."""
    sample_idx: Optional[int] = 0


class ShapResponse(BaseModel):
    """Response for SHAP plots (§4.6)."""
    global_importance: Optional[str] = None  # Base64 PNG
    per_sample_waterfall: Optional[str] = None  # Base64 PNG
    prediction: Optional[float] = None
    row_label: Optional[str] = None
    error: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Request for background data analysis."""
    data: Dict[str, Any]


class AnalyzeStatusResponse(BaseModel):
    """Response for background data analysis status."""
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class QueryRequest(BaseModel):
    """Request for NL query endpoint."""
    question: str


class CalcColumnRequest(BaseModel):
    name: str
    formula: str
    data: Dict[str, Any]


class CalcColumnResponse(BaseModel):
    success: bool
    preview: Optional[List[Any]] = None
    error: Optional[str] = None


analysis_jobs = {}


# ============ ENDPOINTS ============

@app.post("/suitability/{session_id}", response_model=SuitabilityResponse)
async def check_suitability(session_id: str, request: SuitabilityRequest) -> SuitabilityResponse:
    """
    S3: Target suitability pre-flight health check.
    Run BEFORE training to assess if target is suitable.
    
    Checks: completeness, variance, class balance, sample-size heuristic.
    """
    try:
        logger.info(f"[{session_id}] Suitability check for target: {request.target}")
        
        # Parse data
        df = parse_request_data(request.data)
        
        if request.target not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Target column '{request.target}' not found"
            )
        
        y = df[request.target]
        X = df.drop(columns=[request.target])
        
        # Detect task
        task = TaskDetector.detect(y)
        
        # Run suitability check
        result = check_target_suitability(X, y, task)
        imbalance = result["class_imbalance"]
        
        logger.info(f"[{session_id}] Suitability result: suitable={result['suitable']}, "
                    f"imbalanced={imbalance['imbalanced']} (majority={imbalance['majority_share']:.2%})")
        
        return SuitabilityResponse(**result)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Suitability check error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Suitability check failed: {str(e)}")


@app.post("/recommend/{session_id}", response_model=RecommendationResponse)
async def get_recommendations(session_id: str, request: RecommendationRequest) -> RecommendationResponse:
    """
    S2: Feature recommendation bucketing.
    Categorizes features into: high_signal, low_signal, harmful, leakage.
    Run BEFORE or AFTER training; uses leakage flags + importance.
    """
    try:
        logger.info(f"[{session_id}] Feature recommendations for target: {request.target}")
        
        # Parse data
        df = parse_request_data(request.data)
        
        if request.target not in df.columns:
            raise HTTPException(status_code=400, detail=f"Target column '{request.target}' not found")
        
        y = df[request.target]
        X = df.drop(columns=[request.target])
        
        # Detect task
        task = TaskDetector.detect(y)
        
        # Get leakage flags
        from src.modeling import LeakageScan
        leakage_flags = LeakageScan.scan(X, y, task)
        leakage_dicts = [
            {"column": f.column, "reason": f.reason, "score": f.score}
            for f in leakage_flags
        ]
        
        # Get fitted pipeline if available
        pipeline = model_store.get(f"{session_id}_best_pipeline")
        
        # Recommend features
        result = recommend_features(X, y, task, leakage_dicts, pipeline)
        
        logger.info(f"[{session_id}] Recommendations: {len(result['high_signal'])} high, {len(result['leakage'])} leakage")
        
        return RecommendationResponse(**result)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Recommendation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Recommendation failed: {str(e)}")





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


@app.post("/model/{session_id}", response_model=ModelResponse)
async def train_model(session_id: str, request: ModelRequest) -> ModelResponse:
    """
    Train ML models on uploaded data with leakage detection.
    
    §4 Modeling Pipeline:
    - Detect task (classification vs. regression)
    - Scan for leakage (single-feature CV scores + structural giveaways)
    - Train 2 curated models (LogisticRegression/LinearRegression + HistGradientBoosting)
    - Evaluate with StratifiedKFold (classification) or KFold (regression)
    - Report mean ± std metrics across folds
    
    Stores best model in session for later SHAP analysis (§4.6).
    
    Args:
        session_id: Session identifier for tracking
        request: ModelRequest with target, data, excluded_features
    
    Returns:
        ModelResponse with task, leakage flags, model results, and best model
    
    Raises:
        HTTPException: If data is invalid or target column not found
    """
    
    try:
        logger.info(f"[{session_id}] Received model training request for target: {request.target}")
        
        # Parse data
        df = parse_request_data(request.data)
        
        session_data_store[session_id] = df
        logger.info(f"[{session_id}] Loaded data: {df.shape[0]} rows, {df.shape[1]} columns")
        
        # Validate target
        if request.target not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Target column '{request.target}' not found. Available columns: {df.columns.tolist()}"
            )
        
        # Prepare X and y
        y = df[request.target]
        X = df.drop(columns=[request.target])
        
        logger.info(f"[{session_id}] X shape: {X.shape}, y shape: {y.shape}")
        logger.info(f"[{session_id}] Excluded features: {request.excluded_features}")
        
        # Run modeling pipeline
        output = run_modeling_pipeline(
            X=X,
            y=y,
            target_col=request.target,
            excluded_features=request.excluded_features,
            cv_splits=request.cv_splits or 5
        )
        
        # REUSE COMPUTATION: Train best model on full data for SHAP (§4.6)
        # This retrains only once, avoiding duplicate effort
        logger.info(f"[{session_id}] Training best model on full data for SHAP...")
        best_model_name = output.best['model']
        
        X_clean = X.copy()
        # Remove excluded features
        if request.excluded_features:
            X_clean = X_clean.drop(columns=[col for col in request.excluded_features if col in X_clean.columns])
        
        # Handle missing values
        X_clean = impute_missing(X_clean)
        
        # Build and fit best model
        from src.modeling import LeakageSafePipeline
        if best_model_name == "LogisticRegression" or best_model_name == "LinearRegression":
            best_pipeline = LeakageSafePipeline.build_pipeline(X_clean, y, output.task)
        else:
            best_pipeline = LeakageSafePipeline.build_boosting_pipeline(X_clean, y, output.task)
        
        best_pipeline.fit(X_clean, y)
        
        # Store for SHAP analysis
        model_store[f"{session_id}_best_pipeline"] = best_pipeline
        model_store[f"{session_id}_X"] = X_clean
        model_store[f"{session_id}_y"] = y
        model_store[f"{session_id}_task"] = output.task
        
        logger.info(f"[{session_id}] Pipeline complete. Task: {output.task}, Leakage flags: {len(output.leakage_flags)}")
        
        return ModelResponse(
            task=output.task,
            leakage=output.leakage_flags,
            results=output.results,
            best=output.best,
            class_imbalance=output.class_imbalance
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Error during modeling: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Modeling error: {str(e)}")


@app.post("/shap/{session_id}", response_model=ShapResponse)
async def get_shap_analysis(session_id: str, request: ShapRequest) -> ShapResponse:
    """
    §4.6: SHAP explainability analysis for the fitted best model.
    
    REUSES the model trained in /model/{session_id}; no redundant training.
    Generates matplotlib PNGs: global importance bar plot and per-sample waterfall.
    
    Returns base64-encoded PNG strings.
    """
    try:
        logger.info(f"[{session_id}] SHAP analysis request (sample {request.sample_idx})")
        
        # Retrieve stored model and data
        best_pipeline = model_store.get(f"{session_id}_best_pipeline")
        X = model_store.get(f"{session_id}_X")
        y = model_store.get(f"{session_id}_y")
        task = model_store.get(f"{session_id}_task")
        
        if best_pipeline is None or X is None or y is None:
            raise HTTPException(
                status_code=400,
                detail="No trained model found for this session. Run /model first."
            )
        
        # Retrieve raw DataFrame if cached to resolve row labels
        raw_df = session_data_store.get(session_id)
        
        # Generate SHAP plots
        plots = generate_shap_plots(best_pipeline, X, y, task, request.sample_idx or 0, raw_df)
        
        if "error" in plots:
            logger.warning(f"[{session_id}] SHAP error: {plots['error']}")
            return ShapResponse(error=plots['error'])
        
        logger.info(f"[{session_id}] SHAP plots generated successfully")
        
        return ShapResponse(
            global_importance=plots.get('global_importance'),
            per_sample_waterfall=plots.get('per_sample_waterfall'),
            prediction=plots.get('prediction'),
            row_label=plots.get('row_label')
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] SHAP error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"SHAP analysis failed: {str(e)}")





def run_analysis(session_id: str, df: pd.DataFrame):
    try:
        logger.info(f"[{session_id}] Starting background analysis job...")
        columns_profile = profile_dataset(df)
        numeric_cols = [c["name"] for c in columns_profile if c["type"] == "numeric"]
        trust_score, trust_breakdown = compute_trust_score(df, numeric_cols)
        dependency_data = compute_dependency_matrices(df, numeric_cols)
        
        result = {
            "shape": {
                "rows": df.shape[0],
                "cols": df.shape[1],
                "total_cells": int(df.shape[0] * df.shape[1])
            },
            "columns": columns_profile,
            "trust_score": trust_score,
            "trust_breakdown": trust_breakdown,
            "dependency": dependency_data
        }
        
        analysis_jobs[session_id] = {
            "status": "completed",
            "result": result,
            "error": None
        }
        logger.info(f"[{session_id}] Background analysis job completed successfully!")
    except Exception as e:
        logger.error(f"[{session_id}] Background analysis job failed: {str(e)}", exc_info=True)
        analysis_jobs[session_id] = {
            "status": "failed",
            "result": None,
            "error": str(e)
        }


@app.post("/analyze/{session_id}")
async def start_analysis(session_id: str, request: AnalyzeRequest, background_tasks: BackgroundTasks):
    try:
        logger.info(f"[{session_id}] Received analysis request")
        df = parse_request_data(request.data)
        
        # Cache the dataframe for later GET requests (e.g. /anomaly)
        session_data_store[session_id] = df
        
        analysis_jobs[session_id] = {
            "status": "processing",
            "result": None,
            "error": None
        }
        background_tasks.add_task(run_analysis, session_id, df)
        return {"status": "processing"}
    except Exception as e:
        logger.error(f"[{session_id}] Failed to start analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start analysis: {str(e)}")


@app.get("/anomaly/{session_id}")
async def get_anomalies(session_id: str, contamination: float = 0.05):
    """
    GET /anomaly/{session_id} -> ranked anomalous rows with top-3 drivers.
    """
    try:
        logger.info(f"[{session_id}] Anomaly detection request (contamination={contamination})")
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(
                status_code=404,
                detail=f"No dataset found for session '{session_id}'. Please upload a dataset first."
            )
            
        from src.anomaly import run_anomaly_detection
        anomalies = run_anomaly_detection(df, contamination=contamination)
        return anomalies
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Anomaly detection failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Anomaly detection failed: {str(e)}")


@app.get("/analyze/{session_id}", response_model=AnalyzeStatusResponse)
async def get_analysis_status(session_id: str) -> AnalyzeStatusResponse:
    job = analysis_jobs.get(session_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    return AnalyzeStatusResponse(**job)


@app.post("/query/{session_id}")
async def query_dataset(session_id: str, request: QueryRequest):
    """
    POST /query/{session_id} -> generates pandas code using Groq and executes it.
    """
    try:
        logger.info(f"[{session_id}] NL Query request: {request.question}")
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(
                status_code=404,
                detail=f"No dataset found for session '{session_id}'. Please upload a dataset first."
            )
            
        # Get GROQ_API_KEY
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            # Try to read from .env manually in case env is not loaded
            from src.nlquery import load_env
            load_env()
            api_key = os.getenv("GROQ_API_KEY")
            
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="GROQ_API_KEY is not configured on the backend. Please set it in a .env file."
            )
            
        from src.nlquery import generate_pandas_code, execute_pandas_code, serialize_result
        
        # Generate code
        code = generate_pandas_code(request.question, df, api_key)
        
        # Execute code
        raw_result = execute_pandas_code(code, df)
        
        # Serialize
        serialized = serialize_result(raw_result)
        
        return {
            "code": code,
            "result": serialized
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Query execution failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.post("/calc-column/{session_id}", response_model=CalcColumnResponse)
async def add_calc_column(session_id: str, request: CalcColumnRequest) -> CalcColumnResponse:
    """
    Evaluates a user-defined calculated column expression and adds it to the session data.
    """
    try:
        logger.info(f"[{session_id}] Adding calculated column '{request.name}' with formula '{request.formula}'")
        
        # Parse data
        df = parse_request_data(request.data)
        
        # Run calculation
        updated_df, preview_values, error_msg = add_calculated_column(df, request.name, request.formula)
        
        if error_msg:
            logger.warning(f"[{session_id}] Calculated column evaluation error: {error_msg}")
            return CalcColumnResponse(success=False, error=error_msg)
            
        # Store updated DataFrame in the session data stores
        session_data_store[session_id] = updated_df
        
        # Sync update background analysis so dashboard is immediately updated!
        run_analysis(session_id, updated_df)
        
        logger.info(f"[{session_id}] Calculated column '{request.name}' successfully added and session analysis updated.")
        return CalcColumnResponse(success=True, preview=preview_values)
        
    except Exception as e:
        logger.error(f"[{session_id}] Calculated column execution crashed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error evaluating column: {str(e)}")


@app.get("/export/clean-csv/{session_id}")
async def export_clean_csv(session_id: str, excluded_features: str = ""):
    """
    Exports a cleaned version of the session data as a CSV download.
    Applies column exclusions and missing value imputation.
    """
    try:
        logger.info(f"[{session_id}] CSV Export request received. Excluded: '{excluded_features}'")
        
        # Get df from session_data_store
        df = session_data_store.get(session_id)
        if df is None:
            logger.warning(f"[{session_id}] CSV Export failed: session not found")
            raise HTTPException(status_code=404, detail="Session data not found. Please upload a dataset first.")
            
        # Make a copy to avoid mutating original session data
        export_df = df.copy()
        
        # Parse excluded features (robustly handles JSON arrays or comma-separated lists)
        exclude_list = []
        if excluded_features:
            if excluded_features.startswith("["):
                try:
                    exclude_list = json.loads(excluded_features)
                except Exception:
                    exclude_list = [col.strip() for col in excluded_features.split(",") if col.strip()]
            else:
                exclude_list = [col.strip() for col in excluded_features.split(",") if col.strip()]
                
        if exclude_list:
            logger.info(f"[{session_id}] Excluding columns for export: {exclude_list}")
            export_df = export_df.drop(columns=[col for col in exclude_list if col in export_df.columns], errors='ignore')
            
        # Impute missing values using the helper function
        export_df = impute_missing(export_df)
        
        # Convert df to CSV string
        csv_data = export_df.to_csv(index=False)
        
        # Return Response with headers forcing download
        from fastapi.responses import Response
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="insightflow_clean_{session_id}.csv"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] CSV Export crashed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to export CSV: {str(e)}")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "InsightFlow Modeling API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
