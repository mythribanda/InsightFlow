# InsightFlow - Python Backend (§4 Modeling)

## Overview

This Python backend implements the **§4 Modeling Pipeline** for InsightFlow:

- **§4.1**: Task Detection (classification vs. regression)
- **§4.2**: Leakage Scanning (single-feature CV + structural giveaways)
- **§4.3**: Leakage-Safe Pipelines (sklearn ColumnTransformer per-fold refitting)
- **Model Training**: 2 curated models (baseline + HistGradientBoosting)
- **Evaluation**: StratifiedKFold (classification) / KFold (regression) with mean ± std reporting
- **Metrics**: Comprehensive per-task metrics with class imbalance detection

## Setup

### Prerequisites

- Python 3.10+
- pip or conda

### Installation

1. **Create a virtual environment** (optional but recommended):

```bash
cd backend
python -m venv venv

# Activate (on Windows)
venv\Scripts\activate

# Or on macOS/Linux
source venv/bin/activate
```

2. **Install dependencies**:

```bash
pip install -r requirements.txt
```

### Running the Server

```bash
python main.py
```

The FastAPI server will start at `http://localhost:8000`.

- **API Docs**: http://localhost:8000/docs (interactive Swagger UI)
- **Health Check**: http://localhost:8000/health

### Environment Variables

Set `MODELING_API_URL` in the frontend `.env` to point to the backend:

```env
MODELING_API_URL=http://localhost:8000
```

Default is `http://localhost:8000`.

## API Endpoint

### POST /model/{session_id}

Train ML models on uploaded data with leakage detection and multi-fold evaluation.

**Request Body**:

```json
{
  "target": "target_column_name",
  "data": {
    "col1": [1, 2, 3, ...],
    "col2": ["a", "b", "c", ...],
    ...
  },
  "excluded_features": ["feature1", "feature2"],
  "cv_splits": 5
}
```

**Response**:

```json
{
  "task": "classification",
  "leakage": [
    {
      "column": "user_id",
      "reason": "ID-like column: 1000/1000 unique values (100.0%)",
      "score": null
    },
    {
      "column": "leaked_target",
      "reason": "Single-feature CV accuracy 0.987 suspiciously high (baseline: 0.500)",
      "score": 0.987
    }
  ],
  "results": [
    {
      "model": "LogisticRegression",
      "metrics": {
        "accuracy": 0.822,
        "precision": 0.815,
        "recall": 0.822,
        "f1": 0.818,
        "roc_auc": 0.891,
        "balanced_accuracy": 0.821
      },
      "std": {
        "accuracy": 0.023,
        "precision": 0.025,
        "recall": 0.023,
        "f1": 0.024,
        "roc_auc": 0.028,
        "balanced_accuracy": 0.024
      },
      "fold_scores": { ... }
    },
    {
      "model": "HistGradientBoostingClassifier",
      "metrics": { ... },
      "std": { ... },
      "fold_scores": { ... }
    }
  ],
  "best": {
    "model": "HistGradientBoostingClassifier",
    "primary_metric": "roc_auc",
    "value": 0.926,
    "std": 0.031
  }
}
```

## Module Structure

### `src/modeling.py`

Core ML pipeline implementation:

- **`TaskDetector.detect(y)`**: Classify as regression or classification
- **`LeakageScan.scan(X, y, task)`**: Detect leakage (§4.2)
  - Single-feature CV scores
  - Structural giveaways (ID-like, near-perfect correlation)
- **`LeakageSafePipeline.build_pipeline(X, y, task)`**: Linear/logistic baseline
- **`LeakageSafePipeline.build_boosting_pipeline(X, y, task)`**: HistGradientBoosting
- **`evaluate_model_cv(pipeline, X, y, task)`**: Cross-validation evaluation
- **`train_models(X, y, task, excluded_features)`**: Train both models
- **`run_modeling_pipeline(X, y, target_col, ...)`**: Full pipeline orchestration

### `main.py`

FastAPI server with:

- **POST /model/{session_id}**: Main training endpoint
- **GET /health**: Health check

## Usage Example

### Python

```python
import pandas as pd
from src.modeling import run_modeling_pipeline

# Load data
df = pd.read_csv("test-data.csv")

# Define target and features
y = df["target_column"]
X = df.drop(columns=["target_column"])

# Run pipeline
output = run_modeling_pipeline(
    X=X,
    y=y,
    target_col="target_column",
    excluded_features=["id", "leaked_col"],  # Optional
    cv_splits=5
)

# Access results
print(f"Task: {output.task}")
print(f"Leakage flags: {len(output.leakage_flags)}")
for result in output.results:
    print(f"\n{result['model']}:")
    for metric, value in result['metrics'].items():
        std = result['std'][metric]
        print(f"  {metric}: {value:.3f} ± {std:.3f}")
```

### cURL

```bash
curl -X POST http://localhost:8000/model/session-123 \
  -H "Content-Type: application/json" \
  -d '{
    "target": "target_col",
    "data": {
      "col1": [1, 2, 3],
      "col2": ["a", "b", "c"]
    },
    "excluded_features": ["id"],
    "cv_splits": 5
  }'
```

## Acceptance Criteria

### Test: Detect & Exclude Leakage

1. Upload dataset with a deliberately leaky column (e.g., target values copied into a feature)
2. Select target → **Train Models**
3. Verify leakage flags appear with reasons
4. Click to exclude the flagged column
5. **Train Models** again
6. Confirm metrics improve (especially CV scores)
7. Both models should show honest cross-validation estimates

### Example: Iris Classification

```python
from sklearn.datasets import load_iris
import pandas as pd

# Load iris
iris = load_iris()
df = pd.DataFrame(iris.data, columns=iris.feature_names)
df['target'] = iris.target

# Add synthetic leakage: copy target into new column
df['leaky_col'] = df['target'].map({0: 'setosa', 1: 'versicolor', 2: 'virginica'})

# Run pipeline
output = run_modeling_pipeline(
    X=df.drop(columns=['target']),
    y=df['target'],
    target_col='target'
)

# Expected: 'leaky_col' should be flagged
print(output.leakage_flags)
```

## Design Decisions (§4.3 Leakage Safety)

### Why ColumnTransformer inside Pipeline?

**Problem**: Fitting scalers/encoders on full data before split introduces **data leakage**.

**Solution**:
```
Pipeline([
    ColumnTransformer([
        ("num", StandardScaler(), numeric_cols),
        ("cat", OneHotEncoder(), categorical_cols)
    ]),
    Model
])
```

**Guarantee**: In cross-validation, preprocessing **refits per fold**:
- Train fold: ColumnTransformer learns statistics (mean, std) from train set only
- Test fold: Transform applied using train-learned statistics
- No information flows from test → train

## Metrics (S5)

### Classification

- **Accuracy**: Overall correctness (misleading with imbalance)
- **Precision** (weighted): TP / (TP + FP)
- **Recall** (weighted): TP / (TP + FN)
- **F1** (weighted): Harmonic mean of precision & recall
- **ROC-AUC** (one-vs-rest): Discrimination ability
- **Balanced Accuracy**: Avg per-class recall (robust to imbalance)

### Regression

- **MAE**: Mean Absolute Error
- **RMSE**: Root Mean Squared Error
- **R²**: Coefficient of determination
- **MAPE**: Mean Absolute Percentage Error

## Warnings & Heuristics

### Class Imbalance

If majority class > 80%, warning issued:
> "Accuracy is misleading; use F1 or Balanced Accuracy instead."

### Leakage Thresholds

- **Single-feature CV**: Flagged if score > baseline + 0.30 (classification) or R² > 0.80 (regression)
- **ID-like columns**: >95% unique values
- **Correlation**: |r| > 0.98 with target

Adjust in `LeakageScan.scan()` if needed.

## Troubleshooting

### Backend not accessible from frontend

- Check `MODELING_API_URL` in frontend `.env`
- Verify backend running: `curl http://localhost:8000/health`
- Check CORS: frontend and backend may need same origin (use proxy in dev)

### Import errors

```bash
pip install -r requirements.txt --upgrade
```

### Memory issues with large datasets

- Reduce `cv_splits` (default 5)
- Use `HistGradientBoosting` (memory-efficient)
- Consider dataset sampling

## References

- **Sklearn Pipelines**: https://scikit-learn.org/stable/modules/compose.html
- **HistGradientBoosting**: https://scikit-learn.org/stable/modules/ensemble.html#histogram-based-gradient-boosting
- **Cross-validation**: https://scikit-learn.org/stable/modules/cross_validation.html
