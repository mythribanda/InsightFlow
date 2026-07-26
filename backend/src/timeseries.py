import logging
import warnings
from typing import Optional, Dict, Any, List, Tuple
import numpy as np
import pandas as pd
from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.arima.model import ARIMA

logger = logging.getLogger(__name__)

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    logger.warning("Prophet is not installed. Prophet forecasts will fall back to ARIMA.")

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch is not installed. LSTM/GRU forecasts will fall back to ARIMA.")


def detect_datetime_column(df: pd.DataFrame) -> Optional[str]:
    """Auto-detect likely date/time columns in a DataFrame."""
    # 1. Check actual datetime columns first
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return col

    # 2. Check names for common datetime terms
    date_keywords = ["date", "time", "timestamp", "datetime", "created_at", "updated_at", "year", "month", "day"]
    for col in df.columns:
        if any(kw in col.lower() for kw in date_keywords):
            try:
                pd.to_datetime(df[col].dropna().head(10), errors="raise")
                return col
            except:
                pass

    # 3. Try to convert samples of object/string columns to datetime
    for col in df.columns:
        if df[col].dtype == "object" or str(df[col].dtype) == "string":
            sample = df[col].dropna().head(5)
            if not sample.empty:
                try:
                    pd.to_datetime(sample, errors="raise")
                    return col
                except:
                    pass

    return None


def _prepare_time_series(df: pd.DataFrame, date_col: str, value_col: str) -> Tuple[pd.DataFrame, str]:
    """Preprocesses a DataFrame for time series: parses dates, sorts, aggregates duplicates,
    interpolates missing values, and infers frequency. Resamples if frequency is irregular.
    """
    if date_col not in df.columns:
        raise ValueError(f"Date column '{date_col}' not found in dataset")
    if value_col not in df.columns:
        raise ValueError(f"Value column '{value_col}' not found in dataset")

    # Copy and parse date
    df_ts = df[[date_col, value_col]].copy()
    df_ts[date_col] = pd.to_datetime(df_ts[date_col], errors="coerce")
    df_ts = df_ts.dropna(subset=[date_col])

    if len(df_ts) < 2:
        raise ValueError("Time series requires at least 2 valid date-value rows")

    # Coerce numeric value column
    df_ts[value_col] = pd.to_numeric(df_ts[value_col], errors="coerce")
    df_ts = df_ts.dropna(subset=[value_col])

    if len(df_ts) < 2:
        raise ValueError("Time series requires at least 2 valid numeric value rows")

    # Aggregate duplicate timestamps by mean
    df_ts = df_ts.groupby(date_col).mean().reset_index()

    # Sort and set index
    df_ts = df_ts.sort_values(date_col).set_index(date_col)

    # Infer frequency
    freq = pd.infer_freq(df_ts.index)
    if freq is None:
        # If we cannot infer frequency, resample to daily and interpolate to get a regular index
        df_ts = df_ts.resample("D").mean()
        df_ts[value_col] = df_ts[value_col].interpolate(method="linear")
        freq = "D"
    else:
        # Ensure regular grid with interpolation if any timestamps are missing
        df_ts = df_ts.asfreq(freq)
        df_ts[value_col] = df_ts[value_col].interpolate(method="linear")

    # Fill any remaining NaNs at the edges
    df_ts[value_col] = df_ts[value_col].ffill().bfill()

    return df_ts, freq


def decompose_series(df: pd.DataFrame, date_col: str, value_col: str) -> Dict[str, List[Any]]:
    """Decompose time series into trend, seasonal, and residual components.
    Also computes rolling statistics.
    """
    df_ts, freq = _prepare_time_series(df, date_col, value_col)

    # Determine seasonal period
    period = None
    if freq:
        if "D" in freq:
            period = 7  # weekly seasonality
        elif "M" in freq:
            period = 12  # yearly seasonality
        elif "W" in freq:
            period = 52  # yearly seasonality
        elif "Q" in freq:
            period = 4   # yearly seasonality

    # Ensure period is smaller than dataset length
    if period and len(df_ts) <= period * 2:
        period = max(2, len(df_ts) // 2)

    # Perform seasonal decomposition
    decomp = seasonal_decompose(
        df_ts[value_col],
        model="additive",
        period=period,
        extrapolate_trend="freq"
    )

    # Calculate rolling statistics (default 7 periods window or max length // 4)
    window = 7
    if len(df_ts) < window:
        window = max(2, len(df_ts) // 2)

    # Align rolling stats with resampled dates
    rolling_mean_series = df_ts[value_col].rolling(window=window, min_periods=1).mean()
    rolling_std_series = df_ts[value_col].rolling(window=window, min_periods=1).std().fillna(0)

    dates = [d.strftime("%Y-%m-%d") for d in df_ts.index]

    return {
        "dates": dates,
        "observed": df_ts[value_col].tolist(),
        "trend": decomp.trend.tolist(),
        "seasonal": decomp.seasonal.tolist(),
        "residual": decomp.resid.tolist(),
        "rolling_mean": rolling_mean_series.tolist(),
        "rolling_std": rolling_std_series.tolist(),
    }


def compute_rolling_stats(df: pd.DataFrame, date_col: str, value_col: str, window: int) -> Tuple[List[float], List[float]]:
    """Calculate rolling mean and standard deviation for a time series column."""
    df_ts, _ = _prepare_time_series(df, date_col, value_col)
    rolling = df_ts[value_col].rolling(window=window, min_periods=1)
    return rolling.mean().tolist(), rolling.std().fillna(0).tolist()


def forecast_arima(df: pd.DataFrame, date_col: str, value_col: str, periods: int) -> Dict[str, List[Any]]:
    """Forecast future periods using an ARIMA model."""
    df_ts, freq = _prepare_time_series(df, date_col, value_col)

    # Fit ARIMA(1, 1, 1) as a robust general baseline
    from statsmodels.tools.sm_exceptions import ConvergenceWarning
    warnings.simplefilter('ignore', ConvergenceWarning)
    warnings.simplefilter('ignore', UserWarning)

    try:
        model = ARIMA(df_ts[value_col], order=(1, 1, 1))
        fit_res = model.fit()
        forecast_res = fit_res.get_forecast(steps=periods)
        forecast_mean = forecast_res.predicted_mean
        conf_int = forecast_res.conf_int(alpha=0.05)
        lower = conf_int.iloc[:, 0]
        upper = conf_int.iloc[:, 1]
    except Exception as e:
        logger.warning(f"ARIMA(1,1,1) fit failed, falling back to ARIMA(1,0,0): {e}")
        try:
            model = ARIMA(df_ts[value_col], order=(1, 0, 0))
            fit_res = model.fit()
            forecast_res = fit_res.get_forecast(steps=periods)
            forecast_mean = forecast_res.predicted_mean
            conf_int = forecast_res.conf_int(alpha=0.05)
            lower = conf_int.iloc[:, 0]
            upper = conf_int.iloc[:, 1]
        except Exception as e2:
            logger.error(f"ARIMA fallback failed: {e2}")
            # Total fallback to last value
            last_val = float(df_ts[value_col].iloc[-1])
            forecast_mean = pd.Series([last_val] * periods)
            lower = pd.Series([last_val * 0.9] * periods)
            upper = pd.Series([last_val * 1.1] * periods)

    # Generate forecast dates
    last_date = df_ts.index[-1]
    forecast_dates = pd.date_range(start=last_date, periods=periods + 1, freq=freq or "D")[1:]
    dates_str = [d.strftime("%Y-%m-%d") for d in forecast_dates]

    return {
        "dates": dates_str,
        "forecast": forecast_mean.tolist(),
        "lower_bound": lower.tolist(),
        "upper_bound": upper.tolist(),
    }


def forecast_prophet(df: pd.DataFrame, date_col: str, value_col: str, periods: int) -> Dict[str, List[Any]]:
    """Forecast future periods using Prophet, with fallback to ARIMA if not installed or fails."""
    if not PROPHET_AVAILABLE:
        logger.info("Prophet is not available. Falling back to ARIMA forecasting.")
        return forecast_arima(df, date_col, value_col, periods)

    try:
        df_ts, freq = _prepare_time_series(df, date_col, value_col)
        
        # Prepare df format for Prophet
        prophet_df = df_ts.reset_index().rename(columns={date_col: "ds", value_col: "y"})
        
        # Silence Prophet logging
        import logging as py_logging
        py_logging.getLogger('prophet').setLevel(py_logging.WARNING)
        
        m = Prophet(
            daily_seasonality=False,
            weekly_seasonality=len(prophet_df) > 14,
            yearly_seasonality=len(prophet_df) > 365
        )
        m.fit(prophet_df)
        
        future = m.make_future_dataframe(periods=periods, freq=freq or "D", include_history=False)
        forecast = m.predict(future)
        
        dates_str = [d.strftime("%Y-%m-%d") for d in forecast["ds"]]
        
        return {
            "dates": dates_str,
            "forecast": forecast["yhat"].tolist(),
            "lower_bound": forecast["yhat_lower"].tolist(),
            "upper_bound": forecast["yhat_upper"].tolist(),
        }
    except Exception as prophet_err:
        logger.warning(f"Prophet forecast failed: {prophet_err}. Falling back to ARIMA.")
        return forecast_arima(df, date_col, value_col, periods)


class RNNForecaster(nn.Module):
    def __init__(self, input_dim=1, hidden_dim=32, num_layers=1, output_dim=1, cell_type="lstm", dropout=0.1):
        super().__init__()
        self.cell_type = cell_type.lower()
        
        if self.cell_type == "lstm":
            self.rnn = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True, dropout=dropout if num_layers > 1 else 0)
        else:
            self.rnn = nn.GRU(input_dim, hidden_dim, num_layers, batch_first=True, dropout=dropout if num_layers > 1 else 0)
            
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_dim, output_dim)
        
    def forward(self, x):
        out, _ = self.rnn(x)
        out = out[:, -1, :]
        out = self.dropout(out)
        out = self.fc(out)
        return out


def forecast_lstm(
    df: pd.DataFrame,
    date_col: str,
    value_col: str,
    periods: int,
    cell_type: str = "lstm",
    seq_len: int = 10,
    epochs: int = 50,
) -> Dict[str, List[Any]]:
    """Forecast future periods using an LSTM or GRU model trained on the fly."""
    if not TORCH_AVAILABLE:
        logger.info("PyTorch is not available. Falling back to ARIMA forecasting.")
        return forecast_arima(df, date_col, value_col, periods)

    try:
        # Preprocess time series to get aligned regular frequency
        df_ts, freq = _prepare_time_series(df, date_col, value_col)
        values = df_ts[value_col].values.astype(np.float32)
        n_samples = len(values)

        if n_samples <= seq_len:
            seq_len = max(2, n_samples // 3)
            if n_samples <= seq_len:
                logger.warning("Dataset is too short for LSTM/GRU. Falling back to ARIMA.")
                return forecast_arima(df, date_col, value_col, periods)

        # Scale data to [0, 1]
        val_min = float(values.min())
        val_max = float(values.max())
        val_range = val_max - val_min if val_max > val_min else 1.0
        scaled_values = (values - val_min) / val_range

        # Create supervised learning data
        X_data, y_data = [], []
        for i in range(len(scaled_values) - seq_len):
            X_data.append(scaled_values[i : i + seq_len])
            y_data.append(scaled_values[i + seq_len])

        X_data = np.array(X_data, dtype=np.float32)[:, :, np.newaxis]
        y_data = np.array(y_data, dtype=np.float32)[:, np.newaxis]

        X_tensor = torch.from_numpy(X_data)
        y_tensor = torch.from_numpy(y_data)

        n_train = int(len(X_tensor) * 0.8)
        if n_train < 1:
            n_train = len(X_tensor)

        X_train, y_train = X_tensor[:n_train], y_tensor[:n_train]
        X_val, y_val = X_tensor[n_train:], y_tensor[n_train:]

        model = RNNForecaster(input_dim=1, hidden_dim=32, num_layers=1, output_dim=1, cell_type=cell_type, dropout=0.1)
        optimizer = optim.Adam(model.parameters(), lr=0.01)
        criterion = nn.MSELoss()

        best_val_loss = float("inf")
        best_weights = None
        patience = 10
        patience_counter = 0

        model.train()
        for epoch in range(epochs):
            optimizer.zero_grad()
            outputs = model(X_train)
            loss = criterion(outputs, y_train)
            loss.backward()
            optimizer.step()

            if len(X_val) > 0:
                model.eval()
                with torch.no_grad():
                    val_outputs = model(X_val)
                    val_loss = criterion(val_outputs, y_val).item()
                model.train()
            else:
                val_loss = loss.item()

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_weights = {k: v.clone() for k, v in model.state_dict().items()}
                patience_counter = 0
            else:
                patience_counter += 1

            if patience_counter >= patience:
                break

        if best_weights:
            model.load_state_dict(best_weights)

        # Autoregressive recursive forecasting with Monte Carlo Dropout
        num_mc_samples = 30
        mc_forecasts = []
        seed_seq = scaled_values[-seq_len:]

        for mc in range(num_mc_samples):
            current_seq = list(seed_seq)
            predictions = []

            model.train()
            with torch.no_grad():
                for _ in range(periods):
                    input_tensor = torch.tensor(current_seq[-seq_len:], dtype=torch.float32).view(1, seq_len, 1)
                    pred = model(input_tensor).item()
                    predictions.append(pred)
                    current_seq.append(pred)
            
            mc_forecasts.append(predictions)

        mc_forecasts = np.array(mc_forecasts)

        mean_scaled = mc_forecasts.mean(axis=0)
        std_scaled = mc_forecasts.std(axis=0)

        forecast = (mean_scaled * val_range) + val_min
        
        min_std = 0.02 * val_range
        std = (std_scaled * val_range)
        std = np.maximum(std, min_std)

        lower_bound = forecast - 1.96 * std
        upper_bound = forecast + 1.96 * std

        last_date = df_ts.index[-1]
        forecast_dates = pd.date_range(start=last_date, periods=periods + 1, freq=freq or "D")[1:]
        dates_str = [d.strftime("%Y-%m-%d") for d in forecast_dates]

        return {
            "dates": dates_str,
            "forecast": forecast.tolist(),
            "lower_bound": lower_bound.tolist(),
            "upper_bound": upper_bound.tolist(),
        }
    except Exception as lstm_err:
        logger.warning(f"LSTM/GRU forecasting failed: {lstm_err}. Falling back to ARIMA.")
        return forecast_arima(df, date_col, value_col, periods)
