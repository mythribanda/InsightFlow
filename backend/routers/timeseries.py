"""
Time series analysis and forecasting router.

POST /timeseries/decompose/{session_id}
  Decomposes a time series into trend, seasonal, and residual components.

POST /timeseries/forecast/{session_id}
  Forecasts future periods using ARIMA, SARIMA, or Prophet.
"""

import logging
from fastapi import APIRouter, Header, HTTPException

from state import session_data_store, verify_session_owner
from schemas import DecomposeRequest, DecomposeResponse, ForecastRequest, ForecastResponse
from src.timeseries import decompose_series, forecast_arima, forecast_prophet, forecast_lstm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/timeseries", tags=["timeseries"])


@router.post("/decompose/{session_id}", response_model=DecomposeResponse)
async def decompose_time_series(
    session_id: str,
    request: DecomposeRequest,
    x_user_id: str = Header(None)
):
    verify_session_owner(session_id, x_user_id)
    logger.info(f"[{session_id}] Decompose request for: {request.value_column} by {request.date_column}")
    
    df = session_data_store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No dataset found for this session. Please upload a dataset first.")

    try:
        results = decompose_series(df, request.date_column, request.value_column)
        return DecomposeResponse(**results)
    except Exception as e:
        logger.error(f"[{session_id}] Decomposition failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Decomposition failed: {str(e)}")


@router.post("/forecast/{session_id}", response_model=ForecastResponse)
async def forecast_time_series(
    session_id: str,
    request: ForecastRequest,
    x_user_id: str = Header(None)
):
    verify_session_owner(session_id, x_user_id)
    logger.info(f"[{session_id}] Forecast request via method '{request.method}' for {request.value_column} by {request.date_column} (periods: {request.periods})")
    
    df = session_data_store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No dataset found for this session. Please upload a dataset first.")

    method = request.method.lower().strip()
    if method not in ["arima", "sarima", "prophet", "lstm", "gru"]:
        raise HTTPException(status_code=400, detail=f"Unsupported forecasting method: {request.method}")

    try:
        if method in ["arima", "sarima"]:
            results = forecast_arima(df, request.date_column, request.value_column, request.periods)
        elif method == "prophet":
            results = forecast_prophet(df, request.date_column, request.value_column, request.periods)
        else:
            results = forecast_lstm(df, request.date_column, request.value_column, request.periods, cell_type=method)
            
        return ForecastResponse(**results)
    except Exception as e:
        logger.error(f"[{session_id}] Forecasting failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Forecasting failed: {str(e)}")
