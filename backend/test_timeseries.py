import unittest
import numpy as np
import pandas as pd
from src.timeseries import (
    detect_datetime_column,
    decompose_series,
    compute_rolling_stats,
    forecast_arima,
    forecast_prophet,
    forecast_lstm,
)


class TestTimeSeries(unittest.TestCase):
    def setUp(self):
        # Create a synthetic daily time series dataset with trend and weekly seasonality
        dates = pd.date_range(start="2026-01-01", periods=60, freq="D")
        np.random.seed(42)
        trend = np.linspace(10, 20, 60)
        # Weekly seasonality (period = 7)
        seasonality = 5 * np.sin(2 * np.pi * dates.dayofweek / 7)
        noise = np.random.normal(0, 0.5, 60)
        
        self.df = pd.DataFrame({
            "timestamp": dates.strftime("%Y-%m-%d"),
            "value": trend + seasonality + noise,
            "another_col": np.random.randint(0, 100, 60)
        })

    def test_detect_datetime_column(self):
        # Test detection from column name keyword
        col = detect_datetime_column(self.df)
        self.assertEqual(col, "timestamp")

        # Test detection with actual datetime64 type
        df_dt = self.df.copy()
        df_dt["dt_col"] = pd.to_datetime(df_dt["timestamp"])
        df_dt = df_dt.drop(columns=["timestamp"])
        col_dt = detect_datetime_column(df_dt)
        self.assertEqual(col_dt, "dt_col")

    def test_decompose_series(self):
        res = decompose_series(self.df, "timestamp", "value")
        self.assertIn("dates", res)
        self.assertIn("observed", res)
        self.assertIn("trend", res)
        self.assertIn("seasonal", res)
        self.assertIn("residual", res)
        self.assertIn("rolling_mean", res)
        self.assertIn("rolling_std", res)
        
        self.assertEqual(len(res["dates"]), 60)
        self.assertEqual(len(res["observed"]), 60)
        self.assertEqual(len(res["trend"]), 60)
        self.assertEqual(len(res["seasonal"]), 60)
        self.assertEqual(len(res["residual"]), 60)
        self.assertEqual(len(res["rolling_mean"]), 60)
        self.assertEqual(len(res["rolling_std"]), 60)

    def test_compute_rolling_stats(self):
        means, stds = compute_rolling_stats(self.df, "timestamp", "value", window=7)
        self.assertEqual(len(means), 60)
        self.assertEqual(len(stds), 60)

    def test_forecast_arima(self):
        res = forecast_arima(self.df, "timestamp", "value", periods=10)
        self.assertEqual(len(res["dates"]), 10)
        self.assertEqual(len(res["forecast"]), 10)
        self.assertEqual(len(res["lower_bound"]), 10)
        self.assertEqual(len(res["upper_bound"]), 10)
        self.assertEqual(res["dates"][0], "2026-03-02") # Next day after 2026-03-01

    def test_forecast_prophet(self):
        res = forecast_prophet(self.df, "timestamp", "value", periods=5)
        self.assertEqual(len(res["dates"]), 5)
        self.assertEqual(len(res["forecast"]), 5)
        self.assertEqual(len(res["lower_bound"]), 5)
        self.assertEqual(len(res["upper_bound"]), 5)

    def test_forecast_lstm(self):
        res = forecast_lstm(self.df, "timestamp", "value", periods=6, cell_type="lstm")
        self.assertEqual(len(res["dates"]), 6)
        self.assertEqual(len(res["forecast"]), 6)
        self.assertEqual(len(res["lower_bound"]), 6)
        self.assertEqual(len(res["upper_bound"]), 6)

    def test_forecast_gru(self):
        res = forecast_lstm(self.df, "timestamp", "value", periods=4, cell_type="gru")
        self.assertEqual(len(res["dates"]), 4)
        self.assertEqual(len(res["forecast"]), 4)
        self.assertEqual(len(res["lower_bound"]), 4)
        self.assertEqual(len(res["upper_bound"]), 4)


if __name__ == "__main__":
    unittest.main()
