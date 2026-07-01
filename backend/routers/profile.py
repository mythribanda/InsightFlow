import logging
import pandas as pd
import numpy as np
from fastapi import APIRouter, HTTPException

from sklearn.feature_extraction.text import TfidfVectorizer

from state import session_data_store, parse_request_data
from schemas import CalcColumnRequest, CalcColumnResponse
from src.calc_columns import add_calculated_column

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/text-analysis/{session_id}/{column}")
async def analyze_text_column(session_id: str, column: str):
    """
    GET /text-analysis/{session_id}/{column} -> TF-IDF top terms for a free-text column.
    """
    try:
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(status_code=404, detail=f"No dataset found for session '{session_id}'.")
        if column not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{column}' not found.")

        texts = df[column].dropna().astype(str)
        if len(texts) < 5:
            raise HTTPException(status_code=400, detail="Not enough non-null text values to analyze.")

        vectorizer = TfidfVectorizer(max_features=30, stop_words="english", ngram_range=(1, 2))
        tfidf_matrix = vectorizer.fit_transform(texts)
        scores = tfidf_matrix.sum(axis=0).A1
        terms = vectorizer.get_feature_names_out()

        top_terms = sorted(zip(terms, scores), key=lambda x: -x[1])[:20]

        avg_length = float(texts.str.split().str.len().mean())

        return {
            "top_terms": [{"term": t, "score": round(float(s), 3)} for t, s in top_terms],
            "avg_word_count": round(avg_length, 1),
            "sample_count": len(texts),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Text analysis failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Text analysis failed: {str(e)}")


@router.post("/calc-column/{session_id}", response_model=CalcColumnResponse)
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
        from routers.analyze import run_analysis
        run_analysis(session_id, updated_df)
        
        logger.info(f"[{session_id}] Calculated column '{request.name}' successfully added and session analysis updated.")
        return CalcColumnResponse(success=True, preview=preview_values)
        
    except Exception as e:
        logger.error(f"[{session_id}] Calculated column execution crashed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error evaluating column: {str(e)}")
