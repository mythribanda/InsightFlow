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
import re
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.feature_extraction.text import TfidfVectorizer
import duckdb
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

    # Ensure consistent string representation for categorical/non-numeric columns (preserving NaNs)
    # to prevent scikit-learn encoder exceptions on mixed types.
    categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()
    for col in categorical_cols:
        df[col] = df[col].map(lambda x: str(x) if pd.notna(x) else x)
            
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


class ExportCodeRequest(BaseModel):
    """Request body for /export/code/{session_id} endpoint."""
    target: str
    excluded_features: Optional[List[str]] = None
    leakage: List[Dict[str, Any]]
    best_model_name: str
    task: str


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


class VisualizationRequest(BaseModel):
    column1: str
    column2: Optional[str] = None
    chart_type: str


class QueryRequest(BaseModel):
    """Request for NL query endpoint."""
    question: str


class SQLQueryRequest(BaseModel):
    query: str


class ClusterRequest(BaseModel):
    columns: List[str]
    method: str  # "kmeans" or "dbscan"
    n_clusters: Optional[int] = 3  # for kmeans
    eps: Optional[float] = 0.5  # for dbscan
    min_samples: Optional[int] = 5  # for dbscan


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

@app.post("/visualize/{session_id}")
async def get_visualization(session_id: str, request: VisualizationRequest):
    """
    Generate data and insights for client-side visualizations.
    """
    try:
        logger.info(f"[{session_id}] Visualization request for: {request.column1} & {request.column2} (type: {request.chart_type})")
        
        # Retrieve df from store
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(
                status_code=404,
                detail="No dataset found for this session. Please upload a dataset first."
            )
            
        col1 = request.column1
        col2 = request.column2
        chart_type = request.chart_type
        
        if col1 not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col1}' not found in dataset"
            )
            
        if col2 and col2 not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col2}' not found in dataset"
            )
            
        # 1. Scatter Plot
        if chart_type == "scatter":
            if not col2:
                raise HTTPException(status_code=400, detail="Scatter plot requires two columns")
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 2:
                return {"data": [], "insight": "Not enough data points for scatter plot."}
            
            # Sample for performance if needed
            if len(df_clean) > 5000:
                df_clean = df_clean.sample(n=5000, random_state=42)
                
            data = df_clean.to_dict('records')
            
            # Compute correlation
            try:
                r = float(df_clean[col1].corr(df_clean[col2]))
            except:
                r = float('nan')
                
            # Compute trend line
            try:
                x = df_clean[col1].values.astype(float)
                y = df_clean[col2].values.astype(float)
                m, c = np.polyfit(x, y, 1)
                for record in data:
                    record['trend'] = float(m * record[col1] + c)
            except:
                pass
                
            if not np.isnan(r):
                strength = "strong" if abs(r) > 0.7 else "moderate" if abs(r) > 0.4 else "weak"
                direction = "positive" if r > 0 else "negative"
                insight = f"Strong positive correlation (r={r:.2f}) between {col1} and {col2}. This suggests values increase together." if strength == "strong" and direction == "positive" else \
                          f"Strong negative correlation (r={r:.2f}) between {col1} and {col2}. This suggests values move in opposite directions." if strength == "strong" and direction == "negative" else \
                          f"There is a {strength} {direction} correlation (r={r:.2f}) between '{col1}' and '{col2}'."
            else:
                insight = f"Scatter plot of '{col1}' vs '{col2}' generated (no linear correlation computed)."
                
            return {"data": data, "insight": insight, "correlation": r if not np.isnan(r) else None}
            
        # 2. Histogram
        elif chart_type == "histogram":
            df_clean = df[col1].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for histogram."}
            
            counts, bin_edges = np.histogram(df_clean, bins='auto')
            data = []
            for i in range(len(counts)):
                data.append({
                    "bin": f"{bin_edges[i]:.2f} - {bin_edges[i+1]:.2f}",
                    "count": int(counts[i])
                })
            
            peak_bin = data[np.argmax(counts)]["bin"]
            insight = f"The values of '{col1}' range from {df_clean.min():.2f} to {df_clean.max():.2f}, with the peak frequency in the bin '{peak_bin}'."
            return {"data": data, "insight": insight}
            
        # 3. Box Plot (single column)
        elif chart_type == "boxplot" and not col2:
            df_clean = df[col1].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for box plot."}
                
            desc = df_clean.describe()
            q1 = float(desc.get('25%', 0))
            median = float(desc.get('50%', 0))
            q3 = float(desc.get('75%', 0))
            min_val = float(desc.get('min', 0))
            max_val = float(desc.get('max', 0))
            
            data = [{
                "name": col1,
                "min": min_val,
                "q1": q1,
                "median": median,
                "q3": q3,
                "max": max_val
            }]
            insight = f"'{col1}' has a median value of {median:.2f}, with 50% of the data falling between {q1:.2f} (Q1) and {q3:.2f} (Q3)."
            return {"data": data, "insight": insight}
            
        # 4. Box Plot (grouped: categorical + numeric)
        elif chart_type == "boxplot" and col2:
            # col1 is categorical, col2 is numeric
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for grouped box plot."}
                
            groups = df_clean.groupby(col1)[col2]
            data = []
            for name, g in groups:
                if len(g) == 0:
                    continue
                desc = g.describe()
                data.append({
                    "group": str(name),
                    "min": float(desc.get('min', 0)),
                    "q1": float(desc.get('25%', 0)),
                    "median": float(desc.get('50%', 0)),
                    "q3": float(desc.get('75%', 0)),
                    "max": float(desc.get('max', 0))
                })
            
            if not data:
                return {"data": [], "insight": "No grouped data generated."}
                
            data = sorted(data, key=lambda x: x['median'], reverse=True)
            insight = f"Grouped by '{col1}', the highest median '{col2}' is found in group '{data[0]['group']}' ({data[0]['median']:.2f})."
            return {"data": data, "insight": insight}
            
        # 5. Distribution (KDE)
        elif chart_type == "kde":
            df_clean = df[col1].dropna()
            if len(df_clean) < 2:
                return {"data": [], "insight": "Not enough data points for KDE distribution."}
                
            values = df_clean.values.astype(float)
            x_grid = np.linspace(values.min(), values.max(), 100)
            
            # Silverman's bandwidth selection
            n = len(values)
            std = np.std(values)
            if std == 0:
                std = 1.0
            bandwidth = 1.06 * std * (n ** -0.2)
            
            # Compute Gaussian KDE densities in pure numpy
            densities = []
            for x in x_grid:
                diffs = (values - x) / bandwidth
                kernels = np.exp(-0.5 * (diffs ** 2)) / (np.sqrt(2 * np.pi) * bandwidth)
                densities.append(float(np.mean(kernels)))
                
            data = [{"x": float(x), "density": float(d)} for x, d in zip(x_grid, densities)]
            peak_x = x_grid[np.argmax(densities)]
            insight = f"The distribution of '{col1}' is continuous, with a peak density near {peak_x:.2f}."
            return {"data": data, "insight": insight}
            
        # 6. Bar Chart (categorical + numeric)
        elif chart_type == "bar":
            if not col2:
                raise HTTPException(status_code=400, detail="Bar chart requires two columns")
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for bar chart."}
                
            # Aggregate by mean
            grouped = df_clean.groupby(col1)[col2].mean().reset_index()
            data = grouped.rename(columns={col1: "category", col2: "value"}).to_dict('records')
            
            if not data:
                return {"data": [], "insight": "No aggregated data generated."}
                
            data = sorted(data, key=lambda x: x['value'], reverse=True)
            insight = f"On average, group '{data[0]['category']}' has the highest '{col2}' value of {data[0]['value']:.2f}."
            return {"data": data, "insight": insight}
            
        # 7. Heatmap (categorical + categorical)
        elif chart_type == "heatmap":
            if not col2:
                raise HTTPException(status_code=400, detail="Heatmap requires two columns")
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for heatmap."}
                
            ct = pd.crosstab(df_clean[col1], df_clean[col2])
            data = []
            for idx in ct.index:
                for col in ct.columns:
                    data.append({
                        "x": str(idx),
                        "y": str(col),
                        "count": int(ct.loc[idx, col])
                    })
                    
            if not data:
                return {"data": [], "insight": "No cross-tabulated data generated."}
                
            max_cell = max(data, key=lambda x: x['count'])
            insight = f"The combination of '{col1}' = '{max_cell['x']}' and '{col2}' = '{max_cell['y']}' is most frequent, with {max_cell['count']} occurrences."
            return {"data": data, "insight": insight}
            
        # 8. Grouped Bar Chart (categorical + categorical)
        elif chart_type == "grouped_bar":
            if not col2:
                raise HTTPException(status_code=400, detail="Grouped bar chart requires two columns")
            df_clean = df[[col1, col2]].dropna()
            if len(df_clean) < 1:
                return {"data": [], "insight": "Not enough data points for grouped bar chart."}
                
            ct = pd.crosstab(df_clean[col1], df_clean[col2])
            data = []
            for idx in ct.index:
                row = {"name": str(idx)}
                for col in ct.columns:
                    row[str(col)] = int(ct.loc[idx, col])
                data.append(row)
                
            keys = [str(col) for col in ct.columns]
            insight = f"Comparing '{col1}' across '{col2}', the distribution shows varying frequencies per category."
            return {"data": data, "insight": insight, "keys": keys}

        # 9. Line Chart
        elif chart_type == "line":
            is_numeric_x = pd.api.types.is_numeric_dtype(df[col1])
            is_datetime_x = pd.api.types.is_datetime64_any_dtype(df[col1])
            
            if not is_numeric_x and not is_datetime_x:
                try:
                    temp_dt = pd.to_datetime(df[col1], errors='raise')
                    is_datetime_x = True
                except:
                    pass
            
            if not is_numeric_x and not is_datetime_x:
                raise HTTPException(status_code=400, detail="Line chart requires a numeric or date column for the X axis")
            if not col2:
                raise HTTPException(status_code=400, detail="Line chart requires two columns (x and y)")
            
            df_clean = df[[col1, col2]].copy()
            if is_datetime_x and not pd.api.types.is_datetime64_any_dtype(df_clean[col1]):
                df_clean[col1] = pd.to_datetime(df_clean[col1], errors='coerce')
                
            df_clean = df_clean.dropna()
            if len(df_clean) < 2:
                return {"data": [], "insight": "Not enough data points for a line chart."}

            # Sort by col1 so the line reads left-to-right in order
            df_sorted = df_clean.sort_values(by=col1)
            if len(df_sorted) > 2000:
                df_sorted = df_sorted.iloc[::len(df_sorted)//2000]  # downsample evenly, preserve order

            # Convert datetime X column back to string for JSON serialization
            if is_datetime_x:
                df_sorted[col1] = df_sorted[col1].dt.strftime('%Y-%m-%d %H:%M:%S')

            data = df_sorted.to_dict('records')
            trend = "increasing" if df_sorted[col2].iloc[-1] > df_sorted[col2].iloc[0] else "decreasing"
            insight = f"{col2} shows an overall {trend} trend across {col1}."
            return {"data": data, "insight": insight}

        # 10. Pie / Donut Chart
        elif chart_type in ("pie", "donut"):
            if df[col1].nunique() > 50:
                raise HTTPException(status_code=400, detail="Pie/donut charts need a categorical column with fewer distinct values. Try a column with fewer unique categories.")
            series = df[col1].dropna()
            if series.empty:
                return {"data": [], "insight": "No data available for this column."}

            counts = series.value_counts()
            # Cap at top 8 categories, group the rest as "Other"
            if len(counts) > 8:
                top = counts.head(8)
                other_sum = counts.iloc[8:].sum()
                counts = pd.concat([top, pd.Series({"Other": other_sum})])

            total = counts.sum()
            data = [{"name": str(k), "value": int(v), "pct": round(float(v) / total * 100, 1)} for k, v in counts.items()]
            top_cat = counts.index[0]
            top_pct = round(float(counts.iloc[0]) / total * 100, 1)
            insight = f"'{top_cat}' is the largest category at {top_pct}% of {col1}."
            return {"data": data, "insight": insight, "chart_subtype": "donut" if chart_type == "donut" else "pie"}

        # 11. Treemap
        elif chart_type == "treemap":
            if not col2:
                # Single-column treemap: size by category frequency
                series = df[col1].dropna()
                counts = series.value_counts().head(20)
                data = [{"name": str(k), "value": int(v)} for k, v in counts.items()]
                insight = f"Treemap of {col1} by frequency, showing top {len(data)} categories."
            else:
                # Two-column treemap: size by aggregated numeric value per category
                if not pd.api.types.is_numeric_dtype(df[col2]):
                    raise HTTPException(status_code=400, detail="Treemap's second column (size) must be numeric")
                grouped = df.groupby(col1)[col2].sum().sort_values(ascending=False).head(20)
                data = [{"name": str(k), "value": float(v)} for k, v in grouped.items()]
                insight = f"Treemap of {col1}, sized by total {col2}, showing top {len(data)} categories."
            return {"data": data, "insight": insight}

        # 12. Funnel Chart
        elif chart_type == "funnel":
            if not pd.api.types.is_numeric_dtype(df[col1]) and col1 in df.columns:
                series = df[col1].dropna()
                counts = series.value_counts().sort_values(ascending=False).head(10)
                data = [{"stage": str(k), "value": int(v)} for k, v in counts.items()]
                insight = (
                    f"Funnel approximated from {col1} category counts, ordered largest to smallest. "
                    "True funnel stages (e.g. signup → activation → purchase) require columns that "
                    "represent sequential steps — this is a best-effort approximation, not a real conversion funnel."
                )
                return {"data": data, "insight": insight}
            raise HTTPException(status_code=400, detail="Funnel chart requires a categorical column")

        # 13. Waterfall Chart
        elif chart_type == "waterfall":
            if not col2:
                raise HTTPException(status_code=400, detail="Waterfall chart requires two columns: a category and a numeric delta")
            if not pd.api.types.is_numeric_dtype(df[col2]):
                raise HTTPException(status_code=400, detail="Waterfall's second column must be numeric (the delta values)")

            grouped = df.groupby(col1)[col2].sum().head(15)
            cumulative = 0.0
            data = []
            for name, val in grouped.items():
                start = cumulative
                cumulative += float(val)
                data.append({"name": str(name), "start": start, "end": cumulative, "delta": float(val)})

            insight = f"Waterfall shows cumulative effect of {col2} across {col1} categories, ending at {round(cumulative, 2)}."
            return {"data": data, "insight": insight}

        # 14. Gauge Chart
        elif chart_type == "gauge":
            if not pd.api.types.is_numeric_dtype(df[col1]):
                raise HTTPException(status_code=400, detail="Gauge chart requires a numeric column")
            series = df[col1].dropna()
            if series.empty:
                return {"data": [], "insight": "No data available."}

            current = float(series.mean())
            min_val = float(series.min())
            max_val = float(series.max())
            data = [{"value": current, "min": min_val, "max": max_val}]
            insight = f"Average {col1} is {round(current, 2)}, ranging from {round(min_val, 2)} to {round(max_val, 2)}."
            return {"data": data, "insight": insight}

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported chart type '{chart_type}'"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Visualization error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Visualization failed: {str(e)}")


class CodeExportRequest(BaseModel):
    column1: str
    column2: Optional[str] = None
    chart_type: str


@app.post("/visualize/{session_id}/export-code")
async def export_visualization_code(session_id: str, request: CodeExportRequest):
    """Generate a standalone Python script reproducing the requested chart."""
    df = session_data_store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No dataset found for this session.")

    col1 = request.column1
    col2 = request.column2
    chart_type = request.chart_type

    # Verify column existence
    if col1 not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{col1}' not found in dataset")
    if col2 and col2 not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{col2}' not found in dataset")

    templates = {
        "scatter": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

df = pd.read_csv("your_dataset.csv")
df_clean = df[["{col1}", "{col2}"]].dropna()

try:
    r = float(df_clean["{col1}"].corr(df_clean["{col2}"]))
    title_suffix = f" (r = {{r:.3f}})"
except:
    title_suffix = ""

plt.figure(figsize=(8, 6))
plt.scatter(df_clean["{col1}"], df_clean["{col2}"], alpha=0.6, color="#0ea5e9")

# Add trend line if both are numeric
try:
    x = df_clean["{col1}"].values.astype(float)
    y = df_clean["{col2}"].values.astype(float)
    m, c = np.polyfit(x, y, 1)
    x_line = np.linspace(x.min(), x.max(), 100)
    plt.plot(x_line, m * x_line + c, color="#f43f5e", linewidth=2, label="Trend Line")
    plt.legend()
except:
    pass

plt.xlabel("{col1}")
plt.ylabel("{col2}")
plt.title(f"{col1} vs {col2}{{title_suffix}}")
plt.tight_layout()
plt.savefig("scatter_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "histogram": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
series = df["{col1}"].dropna()

plt.figure(figsize=(8, 6))
plt.hist(series, bins="auto", color="#0ea5e9", edgecolor="white")
plt.xlabel("{col1}")
plt.ylabel("Frequency")
plt.title("Distribution of {col1}")
plt.tight_layout()
plt.savefig("histogram_{col1}.png", dpi=150)
plt.show()
""",
        "boxplot": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
""" + (f"""
df_clean = df[["{col1}", "{col2}"]].dropna()
groups = [group.values for name, group in df_clean.groupby("{col1}")["{col2}"]]
labels = [str(name) for name, _ in df_clean.groupby("{col1}")["{col2}"]]

plt.figure(figsize=(10, 6))
plt.boxplot(groups, labels=labels)
plt.xticks(rotation=45, ha="right")
plt.xlabel("{col1}")
plt.ylabel("{col2}")
plt.title("Box Plot of {col2} grouped by {col1}")
""" if col2 else f"""
series = df["{col1}"].dropna()

plt.figure(figsize=(6, 6))
plt.boxplot(series, labels=["{col1}"])
plt.ylabel("{col1}")
plt.title("Box Plot of {col1}")
""") + f"""
plt.tight_layout()
plt.savefig("boxplot_{col1}{'_' + col2 if col2 else ''}.png", dpi=150)
plt.show()
""",
        "kde": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv("your_dataset.csv")
series = df["{col1}"].dropna()

plt.figure(figsize=(8, 6))
sns.kdeplot(series, fill=True, color="#0ea5e9", linewidth=2)
plt.xlabel("{col1}")
plt.ylabel("Density")
plt.title("Density Distribution of {col1}")
plt.tight_layout()
plt.savefig("kde_{col1}.png", dpi=150)
plt.show()
""",
        "bar": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
df_clean = df[["{col1}", "{col2}"]].dropna()
grouped = df_clean.groupby("{col1}")["{col2}"].mean().sort_values(ascending=False).head(20)

plt.figure(figsize=(10, 6))
plt.bar(grouped.index.astype(str), grouped.values, color="#0ea5e9")
plt.xticks(rotation=45, ha="right")
plt.xlabel("{col1}")
plt.ylabel("Average {col2}")
plt.title("Average {col2} by {col1}")
plt.tight_layout()
plt.savefig("bar_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "grouped_bar": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
df_clean = df[["{col1}", "{col2}"]].dropna()
ct = pd.crosstab(df_clean["{col1}"], df_clean["{col2}"])

ax = ct.plot(kind="bar", figsize=(12, 6), width=0.8)
plt.xticks(rotation=45, ha="right")
plt.xlabel("{col1}")
plt.ylabel("Count")
plt.title("Distribution of {col2} across {col1}")
plt.legend(title="{col2}")
plt.tight_layout()
plt.savefig("grouped_bar_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "heatmap": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv("your_dataset.csv")
df_clean = df[["{col1}", "{col2}"]].dropna()
ct = pd.crosstab(df_clean["{col1}"], df_clean["{col2}"])

plt.figure(figsize=(10, 8))
sns.heatmap(ct, annot=True, fmt="d", cmap="YlGnBu", cbar=True)
plt.xlabel("{col2}")
plt.ylabel("{col1}")
plt.title("Heatmap Crosstab: {col1} vs {col2}")
plt.tight_layout()
plt.savefig("heatmap_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "line": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
try:
    if not pd.api.types.is_numeric_dtype(df["{col1}"]):
        df["{col1}"] = pd.to_datetime(df["{col1}"])
except:
    pass

df_clean = df[["{col1}", "{col2}"]].dropna().sort_values(by="{col1}")

plt.figure(figsize=(10, 6))
plt.plot(df_clean["{col1}"], df_clean["{col2}"], color="#0ea5e9", marker="o", markersize=3, linewidth=1.5)
plt.xlabel("{col1}")
plt.ylabel("{col2}")
plt.title("{col2} over {col1}")
plt.xticks(rotation=30)
plt.tight_layout()
plt.savefig("line_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "pie": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
counts = df["{col1}"].dropna().value_counts()

if len(counts) > 8:
    top = counts.head(8)
    other_sum = counts.iloc[8:].sum()
    counts = pd.concat([top, pd.Series({{"Other": other_sum}})])

plt.figure(figsize=(8, 8))
plt.pie(counts.values, labels=counts.index, autopct="%1.1f%%", startangle=90)
plt.title("Distribution of {col1}")
plt.tight_layout()
plt.savefig("pie_{col1}.png", dpi=150)
plt.show()
""",
        "donut": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
counts = df["{col1}"].dropna().value_counts()

if len(counts) > 8:
    top = counts.head(8)
    other_sum = counts.iloc[8:].sum()
    counts = pd.concat([top, pd.Series({{"Other": other_sum}})])

plt.figure(figsize=(8, 8))
wedgeprops = {{"width": 0.4, "edgecolor": "white"}}
plt.pie(counts.values, labels=counts.index, autopct="%1.1f%%", startangle=90, wedgeprops=wedgeprops)
plt.title("Distribution of {col1}")
plt.tight_layout()
plt.savefig("donut_{col1}.png", dpi=150)
plt.show()
""",
        "treemap": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
""" + (f"""
if not pd.api.types.is_numeric_dtype(df["{col2}"]):
    raise ValueError("Treemap size column ({col2}) must be numeric")
grouped = df.groupby("{col1}")["{col2}"].sum().sort_values(ascending=False).head(20)
labels = [f"{{name}}\\n{{val:.1f}}" for name, val in grouped.items()]
sizes = grouped.values
title = "Treemap of {col1} by {col2}"
""" if col2 else f"""
counts = df["{col1}"].dropna().value_counts().head(20)
labels = [f"{{name}}\\n{{val}}" for name, val in counts.items()]
sizes = counts.values
title = "Treemap of {col1} by frequency"
""") + f"""
try:
    import squarify
    plt.figure(figsize=(12, 8))
    colors = plt.cm.tab20(range(len(sizes)))
    squarify.plot(sizes=sizes, label=labels, color=colors, alpha=0.8, text_kwargs={{"fontsize": 8}})
    plt.axis("off")
    plt.title(title)
    plt.tight_layout()
    plt.savefig("treemap_{col1}{'_' + col2 if col2 else ''}.png", dpi=150)
    plt.show()
except ImportError:
    print("Warning: 'squarify' package is required for treemaps in matplotlib.")
    print("Please run: pip install squarify")
    plt.figure(figsize=(10, 6))
    plt.barh(labels, sizes, color="#0ea5e9")
    plt.xlabel("Value" if "{col2}" else "Count")
    plt.title(title + " (Fallback Bar Chart)")
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig("treemap_fallback_{col1}.png", dpi=150)
    plt.show()
""",
        "funnel": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_dataset.csv")
series = df["{col1}"].dropna()
counts = series.value_counts().sort_values(ascending=False).head(10)

stages = counts.index.astype(str).tolist()
values = counts.values.tolist()

plt.figure(figsize=(10, 6))
y_pos = range(len(stages))
max_val = max(values) if values else 1
left_offsets = [(max_val - val) / 2 for val in values]

plt.barh(y_pos, values, left=left_offsets, color="#0ea5e9", align="center", alpha=0.8)
plt.yticks(y_pos, stages)
plt.gca().invert_yaxis()
plt.xlabel("Frequency")
plt.title("Funnel chart of {col1} (Approximated)")
plt.tight_layout()
plt.savefig("funnel_{col1}.png", dpi=150)
plt.show()
""",
        "waterfall": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

df = pd.read_csv("your_dataset.csv")
grouped = df.groupby("{col1}")["{col2}"].sum().head(15)

names = grouped.index.astype(str).tolist()
deltas = grouped.values.tolist()

cumulative = 0.0
starts = []
ends = []
for d in deltas:
    starts.append(cumulative)
    cumulative += d
    ends.append(cumulative)

# Append total bar
names.append("Total")
deltas.append(cumulative)
starts.append(0)
ends.append(cumulative)

plt.figure(figsize=(12, 6))
colors = []
for d in deltas[:-1]:
    colors.append("#10b981" if d >= 0 else "#ef4444")
colors.append("#0ea5e9")

for i in range(len(names)):
    plt.bar(names[i], ends[i] - starts[i], bottom=starts[i], color=colors[i], edgecolor="black")

plt.xticks(rotation=45, ha="right")
plt.ylabel("{col2}")
plt.title("Waterfall: Cumulative effect of {col2} across {col1}")
plt.axhline(0, color="black", linewidth=0.8, linestyle="--")
plt.tight_layout()
plt.savefig("waterfall_{col1}_{col2}.png", dpi=150)
plt.show()
""",
        "gauge": f"""
# Standalone reproduction script generated by InsightFlow
# Replace 'your_dataset.csv' with your actual file path,
# or export your cleaned dataset from the Profiling tab first.

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

df = pd.read_csv("your_dataset.csv")
series = df["{col1}"].dropna()

val = float(series.mean()) if not series.empty else 0.0
min_val = float(series.min()) if not series.empty else 0.0
max_val = float(series.max()) if not series.empty else 100.0
r = max_val - min_val
pct = (val - min_val) / r if r > 0 else 0.5

fig, ax = plt.subplots(figsize=(6, 4), subplot_kw={{"projection": "polar"}})
ax.bar(x=np.pi/2, height=0.5, width=np.pi, bottom=1.0, color="#f1f5f9", edgecolor="none")
progress_angle = np.pi - (pct * np.pi)
ax.bar(x=(np.pi + progress_angle)/2, height=0.5, width=(np.pi - progress_angle), bottom=1.0, color="#0ea5e9", edgecolor="none")

ax.set_yticklabels([])
ax.set_xticklabels([])
ax.grid(False)
ax.spines['polar'].set_visible(False)

plt.text(0, 1.25, f"{{max_val:.2f}}", ha="center", va="center", fontsize=10, fontweight="bold")
plt.text(np.pi, 1.25, f"{{min_val:.2f}}", ha="center", va="center", fontsize=10, fontweight="bold")
plt.text(np.pi/2, 0.4, f"{{val:.2f}}", ha="center", va="center", fontsize=16, fontweight="bold")
plt.text(np.pi/2, 0.1, "Average {col1}", ha="center", va="center", fontsize=8, color="gray")

ax.set_thetamin(0)
ax.set_thetamax(180)

plt.title("Gauge: Mean {col1} within Min-Max Range", fontsize=12, pad=20)
plt.tight_layout()
plt.savefig("gauge_{col1}.png", dpi=150)
plt.show()
"""
    }

    code = templates.get(chart_type)
    if code is None:
        raise HTTPException(status_code=400, detail=f"No code export template for chart type '{chart_type}'")

    filename = f"{chart_type}_{col1}{'_' + col2 if col2 else ''}.py"
    return {"code": code.strip(), "filename": filename}

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
        
        # Drop rows where target is missing
        nan_mask = y.isna()
        if nan_mask.any():
            logger.info(f"[{session_id}] Dropping {nan_mask.sum()} rows with missing target values in recommend.")
            X = X[~nan_mask]
            y = y[~nan_mask]
        
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
        
        # Drop rows where target is missing
        nan_mask = y.isna()
        if nan_mask.any():
            logger.info(f"[{session_id}] Dropping {nan_mask.sum()} rows with missing target values.")
            X = X[~nan_mask]
            y = y[~nan_mask]
        
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


FORBIDDEN_SQL_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|ATTACH|COPY|EXPORT|IMPORT|PRAGMA|CALL)\b",
    re.IGNORECASE,
)

@app.post("/sql-query/{session_id}")
async def run_sql_query(session_id: str, request: SQLQueryRequest):
    """
    POST /sql-query/{session_id} -> runs a read-only SQL SELECT against the
    uploaded dataset using DuckDB, with the dataframe exposed as table 'dataset'.
    """
    try:
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(status_code=404, detail=f"No dataset found for session '{session_id}'.")

        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="Query cannot be empty.")

        if FORBIDDEN_SQL_KEYWORDS.search(query):
            raise HTTPException(
                status_code=400,
                detail="Only SELECT queries are allowed. DDL/DML statements (INSERT, UPDATE, DELETE, DROP, etc.) are blocked."
            )

        if not query.strip().upper().startswith("SELECT") and not query.strip().upper().startswith("WITH"):
            raise HTTPException(
                status_code=400,
                detail="Query must start with SELECT (or WITH for CTEs)."
            )

        logger.info(f"[{session_id}] SQL query: {query}")

        con = duckdb.connect()
        con.register("dataset", df)

        try:
            result_df = con.execute(query).fetchdf()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"SQL error: {str(e)}")
        finally:
            con.close()

        # Cap rows returned to the frontend
        truncated = len(result_df) > 1000
        if truncated:
            result_df = result_df.head(1000)

        # Safe convert to JSON friendly structures
        result_df = result_df.replace({np.nan: None, np.inf: None, -np.inf: None})
        for c in result_df.columns:
            if pd.api.types.is_datetime64_any_dtype(result_df[c]):
                result_df[c] = result_df[c].astype(str).replace("NaT", None)

        return {
            "columns": result_df.columns.tolist(),
            "rows": result_df.to_dict("records"),
            "row_count": len(result_df),
            "truncated": truncated,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] SQL query failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.post("/cluster/{session_id}")
async def run_clustering(session_id: str, request: ClusterRequest):
    """
    POST /cluster/{session_id} -> runs KMeans or DBSCAN on the selected numeric
    columns, returns 2D PCA-projected points with cluster labels for visualization.
    """
    try:
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(status_code=404, detail=f"No dataset found for session '{session_id}'.")

        if len(request.columns) < 2:
            raise HTTPException(status_code=400, detail="Select at least 2 numeric columns for clustering.")

        df_sub = df[request.columns].apply(pd.to_numeric, errors="coerce").dropna()
        if len(df_sub) < 10:
            raise HTTPException(status_code=400, detail="Not enough complete numeric rows to cluster (need at least 10).")

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(df_sub)

        if request.method == "kmeans":
            if request.n_clusters < 2 or request.n_clusters > 20:
                raise HTTPException(status_code=400, detail="n_clusters must be between 2 and 20.")
            model = KMeans(n_clusters=request.n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(X_scaled)
        elif request.method == "dbscan":
            model = DBSCAN(eps=request.eps, min_samples=request.min_samples)
            labels = model.fit_predict(X_scaled)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown clustering method '{request.method}'. Use 'kmeans' or 'dbscan'.")

        n_clusters_found = len(set(labels)) - (1 if -1 in labels else 0)
        noise_count = int((labels == -1).sum()) if request.method == "dbscan" else 0

        # Silhouette score needs at least 2 clusters and no single-cluster degenerate case
        sil_score = None
        if n_clusters_found >= 2:
            mask = labels != -1  # exclude DBSCAN noise points from scoring
            if mask.sum() > 1 and len(set(labels[mask])) >= 2:
                try:
                    sil_score = float(silhouette_score(X_scaled[mask], labels[mask]))
                except:
                    sil_score = None

        # Project to 2D for visualization regardless of how many columns were selected
        if X_scaled.shape[1] > 2:
            pca = PCA(n_components=2, random_state=42)
            coords = pca.fit_transform(X_scaled)
            variance_explained = float(pca.explained_variance_ratio_.sum())
        else:
            coords = X_scaled
            variance_explained = 1.0

        data = [
            {"x": float(coords[i, 0]), "y": float(coords[i, 1]), "cluster": int(labels[i])}
            for i in range(len(labels))
        ]

        insight = f"Found {n_clusters_found} cluster(s) using {request.method}."
        if request.method == "dbscan" and noise_count > 0:
            insight += f" {noise_count} points classified as noise (not in any cluster)."
        if sil_score is not None:
            quality = "well-separated" if sil_score > 0.5 else "weakly separated" if sil_score > 0.25 else "poorly separated"
            insight += f" Silhouette score {round(sil_score, 2)} ({quality})."
        if X_scaled.shape[1] > 2:
            insight += f" 2D projection (PCA) explains {round(variance_explained * 100, 1)}% of variance — some structure is lost in this view."

        return {
            "data": data,
            "n_clusters_found": n_clusters_found,
            "noise_count": noise_count,
            "silhouette_score": sil_score,
            "variance_explained": variance_explained,
            "insight": insight,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Clustering failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Clustering failed: {str(e)}")


@app.get("/text-analysis/{session_id}/{column}")
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


@app.post("/export/code/{session_id}")
async def export_code(session_id: str, request: ExportCodeRequest):
    """
    Generates a standalone Python script that reproduces the preprocessing,
    modeling training, and validation visualizations on raw data.
    """
    try:
        logger.info(f"[{session_id}] Code reproduction export request received for target: {request.target}")
        
        # Build comment list of exclusions
        exclusions_comments = []
        all_excluded_names = []
        
        # Pull leakage reasons
        leakage_reasons = {flag.get("column"): flag.get("reason", "Leakage flag") for flag in request.leakage if flag.get("column")}
        
        # Add leakage flags first (so we get their actual reason)
        for col_name, reason in leakage_reasons.items():
            exclusions_comments.append(f"#   - {col_name}: {reason}")
            all_excluded_names.append(col_name)
            
        # Add user-excluded features next (only if not already in leakage flags)
        if request.excluded_features:
            for col in request.excluded_features:
                if col not in all_excluded_names:
                    exclusions_comments.append(f"#   - {col}: user-excluded")
                    all_excluded_names.append(col)
                
        exclusions_comments_str = "\n".join(exclusions_comments) if exclusions_comments else "#   - None"
        
        best_model = request.best_model_name
        is_classification = (request.task == "classification")
        
        # Import statement and estimator setup
        if "LogisticRegression" in best_model:
            model_import = "from sklearn.linear_model import LogisticRegression"
            estimator_setup = """# Gated to n_jobs=1 on Windows due to OpenMP/joblib duplicate runtime deadlock, -1 (max parallel) on Linux
    n_jobs_val = 1 if sys.platform == "win32" else -1
    estimator = LogisticRegression(random_state=42, max_iter=1000, n_jobs=n_jobs_val)"""
        elif "LinearRegression" in best_model:
            model_import = "from sklearn.linear_model import LinearRegression"
            estimator_setup = """# Gated to n_jobs=1 on Windows due to OpenMP/joblib duplicate runtime deadlock, -1 (max parallel) on Linux
    n_jobs_val = 1 if sys.platform == "win32" else -1
    estimator = LinearRegression(n_jobs=n_jobs_val)"""
        elif "HistGradientBoostingClassifier" in best_model:
            model_import = "from sklearn.ensemble import HistGradientBoostingClassifier"
            estimator_setup = "estimator = HistGradientBoostingClassifier(random_state=42, max_iter=100)"
        elif "HistGradientBoostingRegressor" in best_model:
            model_import = "from sklearn.ensemble import HistGradientBoostingRegressor"
            estimator_setup = "estimator = HistGradientBoostingRegressor(random_state=42, max_iter=100)"
        else:
            if is_classification:
                model_import = "from sklearn.ensemble import HistGradientBoostingClassifier"
                estimator_setup = "estimator = HistGradientBoostingClassifier(random_state=42, max_iter=100)"
            else:
                model_import = "from sklearn.ensemble import HistGradientBoostingRegressor"
                estimator_setup = "estimator = HistGradientBoostingRegressor(random_state=42, max_iter=100)"
                
        is_boosting = "HistGradientBoosting" in best_model
        if is_boosting:
            transformers_setup = """if numeric_cols:
        transformers.append(
            ("num", Pipeline([
                ("imp", SimpleImputer(strategy="median"))
            ]), numeric_cols)
        )
    if categorical_cols:
        transformers.append(
            ("cat", Pipeline([
                ("imp", SimpleImputer(strategy="most_frequent")),
                ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
            ]), categorical_cols)
        )"""
        else:
            transformers_setup = """if numeric_cols:
        transformers.append(
            ("num", Pipeline([
                ("imp", SimpleImputer(strategy="median")),
                ("sc", StandardScaler())
            ]), numeric_cols)
        )
    if categorical_cols:
        transformers.append(
            ("cat", Pipeline([
                ("imp", SimpleImputer(strategy="most_frequent")),
                ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
            ]), categorical_cols)
        )"""
        
        # Build visualizations code block
        if is_classification:
            visualizations_code = """# Plot 1: Target Distribution
    plt.figure(figsize=(8, 5))
    y.value_counts().plot(kind='bar', color='#14b8c8', edgecolor='black')
    plt.ylabel("Count")
    plt.xlabel(target_col)
    plt.title(f"Target Distribution: {target_col}")
    plt.tight_layout()
    plot1_path = "target_distribution.png"
    plt.savefig(plot1_path)
    plt.close()
    print(f"  Saved target distribution plot to {plot1_path}")
    
    # Plot 2: Feature-vs-Target Plot
    corr_feature = None
    is_numeric_feature = False
    if numeric_cols:
        corr_feature = numeric_cols[0]
        is_numeric_feature = True
    elif categorical_cols:
        corr_feature = categorical_cols[0]
        is_numeric_feature = False
        
    if corr_feature:
        plt.figure(figsize=(8, 5))
        if is_numeric_feature:
            # Boxplot of numeric feature grouped by classification target
            data_to_plot = [X[corr_feature][y == val].dropna() for val in y.dropna().unique()]
            labels = [str(val) for val in y.dropna().unique()]
            plt.boxplot(data_to_plot, labels=labels)
            plt.xlabel(target_col)
            plt.ylabel(corr_feature)
        else:
            # Contingency/bar plot of target classes count per category
            counts = pd.crosstab(X[corr_feature], y)
            counts.plot(kind='bar', stacked=True, ax=plt.gca())
            plt.xlabel(corr_feature)
            plt.ylabel("Count")
            
        plt.title(f"{corr_feature} vs {target_col}")
        plt.tight_layout()
        plot2_path = f"feature_vs_target_{corr_feature}.png"
        plt.savefig(plot2_path)
        plt.close()
        print(f"  Saved feature vs target plot to {plot2_path}")"""
        else:
            visualizations_code = """# Plot 1: Target Distribution
    plt.figure(figsize=(8, 5))
    plt.hist(y.dropna(), bins=20, color='#14b8c8', edgecolor='black')
    plt.ylabel("Frequency")
    plt.xlabel(target_col)
    plt.title(f"Target Distribution: {target_col}")
    plt.tight_layout()
    plot1_path = "target_distribution.png"
    plt.savefig(plot1_path)
    plt.close()
    print(f"  Saved target distribution plot to {plot1_path}")
    
    # Plot 2: Feature-vs-Target Plot
    corr_feature = None
    is_numeric_feature = False
    if numeric_cols:
        corr_feature = numeric_cols[0]
        is_numeric_feature = True
    elif categorical_cols:
        corr_feature = categorical_cols[0]
        is_numeric_feature = False
        
    if corr_feature:
        plt.figure(figsize=(8, 5))
        if is_numeric_feature:
            # Scatter plot for regression
            plt.scatter(X[corr_feature], y, alpha=0.6, color='#f59e0b')
            plt.ylabel(target_col)
            plt.xlabel(corr_feature)
        else:
            # Boxplot of regression target grouped by categorical feature
            data_to_plot = [y[X[corr_feature] == val].dropna() for val in X[corr_feature].dropna().unique()]
            labels = [str(val) for val in X[corr_feature].dropna().unique()]
            plt.boxplot(data_to_plot, labels=labels)
            plt.xlabel(corr_feature)
            plt.ylabel(target_col)
            
        plt.title(f"{corr_feature} vs {target_col}")
        plt.tight_layout()
        plot2_path = f"feature_vs_target_{corr_feature}.png"
        plt.savefig(plot2_path)
        plt.close()
        print(f"  Saved feature vs target plot to {plot2_path}")"""
        
        # Base script template
        template = """# Standalone Reproduction Script Generated by InsightFlow
# Session ID: {SESSION_ID}
# Target Column: {TARGET}
# Task Type: {TASK}
# Best Model Trained: {BEST_MODEL}
#
# Exclusions Applied:
{EXCLUSIONS}

import sys
import os
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
{MODEL_IMPORT}

def main():
    if len(sys.argv) < 2:
        print("Usage: python reproduce.py <path_to_raw_csv>")
        sys.exit(1)
        
    csv_path = sys.argv[1]
    if not os.path.exists(csv_path):
        print(f"Error: File '{csv_path}' does not exist.")
        sys.exit(1)
        
    print(f"Loading raw dataset from {csv_path}...")
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"Error loading CSV file: {e}")
        sys.exit(1)
        
    # Replace empty strings and whitespace-only strings with NaN
    df = df.replace(r'^\\s*$', np.nan, regex=True)
    
    # Try to convert each column to numeric if possible (matching parse_request_data)
    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col])
        except (ValueError, TypeError):
            pass
            
    print(f"Loaded dataset: {df.shape[0]} rows, {df.shape[1]} columns.")
    
    # Apply exclusions
    excluded_cols = {EXCLUDED_COLS_LIST}
    print(f"Dropping excluded and leakage columns: {excluded_cols}")
    df = df.drop(columns=excluded_cols, errors='ignore')
    
    # Target validation
    target_col = "{TARGET}"
    if target_col not in df.columns:
        print(f"Error: Target column '{target_col}' not found in dataset columns: {list(df.columns)}")
        sys.exit(1)
        
    y = df[target_col]
    X = df.drop(columns=[target_col])
    
    # Drop rows where target is missing
    nan_mask = y.isna()
    if nan_mask.any():
        print(f"Dropping {nan_mask.sum()} rows with missing target values.")
        X = X[~nan_mask]
        y = y[~nan_mask]
    
    # Identify numeric and categorical columns
    numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = X.select_dtypes(exclude=[np.number]).columns.tolist()
    
    # Build preprocessing pipeline matching LeakageSafePipeline in backend/src/modeling.py
    transformers = []
    {TRANSFORMERS_SETUP}
    
    preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
    
    # Estimator setup
    {ESTIMATOR_SETUP}
    
    # Fit the pipeline
    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("model", estimator)
    ])
    
    print("Fitting model...")
    pipeline.fit(X, y)
    print("Model fit complete!")
    
    # ── Visualizations ──
    print("Generating visualizations...")
    
    {VISUALIZATIONS_CODE}
        
    print("\\nStandalone reproduction completed successfully!")

if __name__ == '__main__':
    main()
"""
        
        # Apply replacements
        script_code = template.replace("{SESSION_ID}", session_id)
        script_code = script_code.replace("{TARGET}", request.target)
        script_code = script_code.replace("{TASK}", request.task)
        script_code = script_code.replace("{BEST_MODEL}", best_model)
        script_code = script_code.replace("{EXCLUSIONS}", exclusions_comments_str)
        script_code = script_code.replace("{MODEL_IMPORT}", model_import)
        script_code = script_code.replace("{EXCLUDED_COLS_LIST}", str(all_excluded_names))
        script_code = script_code.replace("{TRANSFORMERS_SETUP}", transformers_setup)
        script_code = script_code.replace("{ESTIMATOR_SETUP}", estimator_setup)
        script_code = script_code.replace("{VISUALIZATIONS_CODE}", visualizations_code)
        
        # Return script as Response
        from fastapi.responses import Response
        return Response(
            content=script_code,
            media_type="text/x-python",
            headers={
                "Content-Disposition": f'attachment; filename="reproduce.py"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.error(f"[{session_id}] Code reproduction export crashed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate reproduction script: {str(e)}")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "InsightFlow Modeling API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
