from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ModelRequest(BaseModel):
    """Request body for /model/{session_id} endpoint."""
    target: str  # Name of target column
    data: Dict[str, Any]  # CSV data as dict or base64-encoded CSV string
    excluded_features: Optional[List[str]] = None
    cv_splits: Optional[int] = 5
    model_selection: Optional[List[str]] = None  # e.g. ["baseline", "randomforest", "catboost"]
    project_id: Optional[str] = None  # If set, training results are persisted to experiment_runs


class ModelResponse(BaseModel):
    """Response body for modeling endpoint."""
    task: str
    leakage: List[Dict[str, Any]]
    results: List[Dict[str, Any]]
    best: Dict[str, Any]
    class_imbalance: Dict[str, Any]  # {majority_share: float, imbalanced: bool, message: str|None}
    baseline_coefficients: Optional[Dict[str, Any]] = None


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


class ColumnFilter(BaseModel):
    column: str
    type: str
    value: Any

class VisualizationRequest(BaseModel):
    column1: str
    column2: Optional[str] = None
    chart_type: str
    filters: Optional[List[ColumnFilter]] = None



class CodeExportRequest(BaseModel):
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


class OptimalKRequest(BaseModel):
    columns: List[str]


class CalcColumnRequest(BaseModel):
    name: str
    formula: str
    data: Dict[str, Any]
    project_id: Optional[str] = None  # If set, a new version snapshot will be written


class CalcColumnResponse(BaseModel):
    success: bool
    preview: Optional[List[Any]] = None
    error: Optional[str] = None


class TuneRequest(BaseModel):
    """Request body for POST /tune/{session_id}."""
    model_name: str                               # e.g. "HistGradientBoostingClassifier"
    search_type: str = "random"                   # "grid" | "random"
    param_grid: Optional[Dict[str, Any]] = None   # optional override; keys must use model__ prefix
    n_iter: int = 20                              # random search only
    cv_splits: int = 5


class TuneResponse(BaseModel):
    """Response body for POST /tune/{session_id}."""
    model_name: str
    search_type: str
    best_params: Dict[str, Any]
    best_score: float
    baseline_score: Optional[float] = None        # CV score from original train_models run
    scoring_metric: str
    n_candidates: int
    search_duration_s: float
    cv_results_summary: List[Dict[str, Any]]
    tuned_pipeline_key: str                       # model_store key for the refit pipeline


class StatsRequest(BaseModel):
    """Request schema for statistical hypothesis testing."""
    test_type: str                  # "t_test" | "z_test" | "anova" | "chi_square" | "confidence_interval"
    column: str                     # Primary dependent column
    group_column: Optional[str] = None  # Grouping independent column (required for t-test/z-test/anova)
    confidence: Optional[float] = 0.95  # Confidence level (for confidence_interval, e.g. 0.95)


class StatsResponse(BaseModel):
    """Response schema for statistical hypothesis testing."""
    statistic: float
    p_value: float
    significant: bool
    interpretation: str
    extra_info: Optional[Dict[str, Any]] = None


class DecomposeRequest(BaseModel):
    date_column: str
    value_column: str


class DecomposeResponse(BaseModel):
    dates: List[str]
    observed: List[float]
    trend: List[float]
    seasonal: List[float]
    residual: List[float]
    rolling_mean: List[float]
    rolling_std: List[float]


class ForecastRequest(BaseModel):
    method: str  # "arima" | "sarima" | "prophet"
    date_column: str
    value_column: str
    periods: int


class ForecastResponse(BaseModel):
    dates: List[str]
    forecast: List[float]
    lower_bound: List[float]
    upper_bound: List[float]

