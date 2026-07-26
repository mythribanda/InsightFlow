import logging
import pandas as pd
import numpy as np
from fastapi import APIRouter, HTTPException, Header

from sklearn.feature_extraction.text import TfidfVectorizer
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from state import session_data_store, parse_request_data, verify_session_owner
from schemas import CalcColumnRequest, CalcColumnResponse
from src.calc_columns import add_calculated_column

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/text-analysis/{session_id}/{column}")
async def analyze_text_column(session_id: str, column: str, x_user_id: str = Header(None)):
    verify_session_owner(session_id, x_user_id)
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


@router.get("/sentiment-analysis/{session_id}/{column}")
async def analyze_sentiment_column(session_id: str, column: str, x_user_id: str = Header(None)):
    verify_session_owner(session_id, x_user_id)
    """
    GET /sentiment-analysis/{session_id}/{column} -> VADER sentiment scores for a text column.
    """
    try:
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(status_code=404, detail=f"No dataset found for session '{session_id}'.")
        if column not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{column}' not found.")

        texts = df[column].dropna().astype(str).tolist()
        if len(texts) < 5:
            raise HTTPException(status_code=400, detail="Not enough non-null text values to analyze.")

        analyzer = SentimentIntensityAnalyzer()
        results = []
        pos_count = 0
        neg_count = 0
        neu_count = 0
        total_compound = 0.0

        for text in texts:
            scores = analyzer.polarity_scores(text)
            results.append({
                "text": text[:200],  # cap preview size
                "pos": float(scores["pos"]),
                "neu": float(scores["neu"]),
                "neg": float(scores["neg"]),
                "compound": float(scores["compound"])
            })
            compound = scores["compound"]
            total_compound += compound
            if compound >= 0.05:
                pos_count += 1
            elif compound <= -0.05:
                neg_count += 1
            else:
                neu_count += 1

        total = len(texts)
        avg_compound = total_compound / total if total > 0 else 0.0
        pct_positive = (pos_count / total) * 100 if total > 0 else 0.0
        pct_negative = (neg_count / total) * 100 if total > 0 else 0.0
        pct_neutral = (neu_count / total) * 100 if total > 0 else 0.0

        return {
            "avg_compound": round(avg_compound, 3),
            "pct_positive": round(pct_positive, 1),
            "pct_negative": round(pct_negative, 1),
            "pct_neutral": round(pct_neutral, 1),
            "per_row_scores": results[:100],  # cap list to prevent payload bloating
            "total_count": total
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Sentiment analysis failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sentiment analysis failed: {str(e)}")


@router.post("/calc-column/{session_id}", response_model=CalcColumnResponse)
async def add_calc_column(session_id: str, request: CalcColumnRequest, x_user_id: str = Header(None)) -> CalcColumnResponse:
    verify_session_owner(session_id, x_user_id)
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

        # Write a version snapshot if a project_id was supplied
        if request.project_id:
            try:
                from routers.projects import write_project_version
                analysis_job = __import__("state", fromlist=["analysis_jobs"]).analysis_jobs.get(session_id)
                analysis_result = analysis_job.get("result") if analysis_job else None
                write_project_version(
                    request.project_id,
                    updated_df,
                    analysis_result,
                    f"Added column '{request.name}'"
                )
            except Exception as ve:
                logger.warning(f"[{session_id}] Failed to write calc-column version: {ve}")
        
        logger.info(f"[{session_id}] Calculated column '{request.name}' successfully added and session analysis updated.")
        return CalcColumnResponse(success=True, preview=preview_values)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Calculated column execution crashed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error evaluating column: {str(e)}")

