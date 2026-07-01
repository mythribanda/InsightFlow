import logging
from fastapi import APIRouter, HTTPException

from state import model_store, session_data_store
from schemas import ShapRequest, ShapResponse
from src.modeling_extensions import generate_shap_plots

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/shap/{session_id}", response_model=ShapResponse)
async def get_shap_analysis(session_id: str, request: ShapRequest) -> ShapResponse:
    """
    §4.6: SHAP explainability analysis for the fitted best model.
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
