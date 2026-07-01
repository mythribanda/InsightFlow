from pydantic import BaseModel
from typing import Optional, List, Dict, Any

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


class CalcColumnResponse(BaseModel):
    success: bool
    preview: Optional[List[Any]] = None
    error: Optional[str] = None
