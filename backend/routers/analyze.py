import logging
import time
import os
import json
import pandas as pd
import numpy as np
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import Response

from state import (
    session_data_store,
    analysis_jobs,
    anomaly_results_store,
    model_results_store,
    parse_request_data,
    impute_missing,
)
from schemas import AnalyzeRequest, AnalyzeStatusResponse
from src.profile import profile_dataset
from src.trust import compute_trust_score
from src.dependency import compute_dependency_matrices

logger = logging.getLogger(__name__)
router = APIRouter()

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


@router.post("/analyze/{session_id}")
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


@router.get("/analyze/{session_id}", response_model=AnalyzeStatusResponse)
async def get_analysis_status(session_id: str):
    job = analysis_jobs.get(session_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"No analysis job found for session '{session_id}'")
    return job


@router.get("/anomaly/{session_id}")
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
        # Store for insights/chatbot
        anomaly_results_store[session_id] = anomalies
        return anomalies
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Anomaly detection failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Anomaly detection failed: {str(e)}")


@router.post("/story/{session_id}")
async def get_story(session_id: str):
    """
    POST /story/{session_id} -> compiles computed facts JSON, converts to narrative with Groq,
    and returns both.
    """
    try:
        logger.info(f"[{session_id}] Narrative story request received")
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(
                status_code=404,
                detail=f"No dataset found for session '{session_id}'. Please upload a dataset first."
            )

        # Retrieve analysis results
        job = analysis_jobs.get(session_id)
        if not job or job.get("status") != "completed":
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
        else:
            result = job["result"]

        model_result = model_results_store.get(session_id)
        anomaly_result = anomaly_results_store.get(session_id)

        from src.insights import build_insights, generate_narrative_from_json, verify_numbers_grounded
        
        insights_json = build_insights(
            df=df,
            profile=result["columns"],
            trust=(result["trust_score"], result["trust_breakdown"]),
            deps=result["dependency"],
            leakage=model_result.get("leakage", []) if model_result else [],
            model_result=model_result,
            anomaly_result=anomaly_result
        )

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            from src.nlquery import load_env
            load_env()
            api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="GROQ_API_KEY is not configured on the backend. Please configure it in a .env file."
            )

        narrative = generate_narrative_from_json(insights_json, api_key)

        # Grounding check
        mismatches = verify_numbers_grounded(narrative, insights_json)
        if mismatches:
            logger.warning(f"[{session_id}] Grounding validation warning: Markdown narrative contains numbers not in source_json: {mismatches}")

        return {
            "narrative": narrative,
            "source_json": insights_json
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Failed to generate story: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate story: {str(e)}")


@router.get("/export/clean-csv/{session_id}")
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
