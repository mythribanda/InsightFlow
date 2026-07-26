import logging
import time
import os
import sys
import json
import pandas as pd
import numpy as np
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import Response

from state import (
    model_store,
    session_data_store,
    model_results_store,
    parse_request_data,
    impute_missing,
    verify_session_owner,
)
from schemas import (
    ModelRequest,
    ModelResponse,
    ExportCodeRequest,
    SuitabilityRequest,
    SuitabilityResponse,
    RecommendationRequest,
    RecommendationResponse,
)
from src.modeling import (
    TaskDetector,
    run_modeling_pipeline,
)
from src.modeling_extensions import (
    check_target_suitability,
    recommend_features,
)
from src.supabase_client import supabase_request

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/suitability/{session_id}", response_model=SuitabilityResponse)
async def check_suitability(session_id: str, request: SuitabilityRequest, x_user_id: str = Header(None)) -> SuitabilityResponse:
    """
    S3: Target suitability pre-flight health check.
    Run BEFORE training to assess if target is suitable.
    
    Checks: completeness, variance, class balance, sample-size heuristic.
    """
    verify_session_owner(session_id, x_user_id)
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


@router.post("/recommend/{session_id}", response_model=RecommendationResponse)
async def get_recommendations(session_id: str, request: RecommendationRequest, x_user_id: str = Header(None)) -> RecommendationResponse:
    """
    S2: Feature recommendation bucketing.
    Categorizes features into: high_signal, low_signal, harmful, leakage.
    Run BEFORE or AFTER training; uses leakage flags + importance.
    """
    verify_session_owner(session_id, x_user_id)
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


@router.post("/model/{session_id}", response_model=ModelResponse)
async def train_model(session_id: str, request: ModelRequest, x_user_id: str = Header(None)) -> ModelResponse:
    """
    Train ML models on uploaded data with leakage detection.
    """
    verify_session_owner(session_id, x_user_id)
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
            cv_splits=request.cv_splits or 5,
            model_selection=request.model_selection,
        )
        
        # REUSE COMPUTATION: Train best model on full data for SHAP (§4.6)
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
        # Dispatch to the correct builder for every supported model name.
        # Falls back to build_boosting_pipeline for any unrecognised name.
        _PIPELINE_BUILDERS = {
            "LogisticRegression": LeakageSafePipeline.build_pipeline,
            "LinearRegression": LeakageSafePipeline.build_pipeline,
            "HistGradientBoostingClassifier": LeakageSafePipeline.build_boosting_pipeline,
            "HistGradientBoostingRegressor": LeakageSafePipeline.build_boosting_pipeline,
            "RandomForestClassifier": LeakageSafePipeline.build_random_forest_pipeline,
            "RandomForestRegressor": LeakageSafePipeline.build_random_forest_pipeline,
            "SVC": LeakageSafePipeline.build_svm_pipeline,
            "SVR": LeakageSafePipeline.build_svm_pipeline,
            "KNeighborsClassifier": LeakageSafePipeline.build_knn_pipeline,
            "KNeighborsRegressor": LeakageSafePipeline.build_knn_pipeline,
            "CatBoostClassifier": LeakageSafePipeline.build_catboost_pipeline,
            "CatBoostRegressor": LeakageSafePipeline.build_catboost_pipeline,
        }
        builder_fn = _PIPELINE_BUILDERS.get(
            best_model_name, LeakageSafePipeline.build_boosting_pipeline
        )
        best_pipeline = builder_fn(X_clean, y, output.task)
        
        best_pipeline.fit(X_clean, y)
        
        # Extract baseline model coefficients (Linear/Logistic Regression)
        baseline_coefficients = None
        try:
            logger.info(f"[{session_id}] Training baseline model to extract coefficients...")
            baseline_pipeline = LeakageSafePipeline.build_pipeline(X_clean, y, output.task)
            baseline_pipeline.fit(X_clean, y)
            
            model = baseline_pipeline.named_steps["model"]
            preprocessor = baseline_pipeline.named_steps["preprocessor"]
            
            def clean_feature_name(name: str) -> str:
                if name.startswith("num__"):
                    return name[5:]
                if name.startswith("cat__"):
                    inner = name[5:]
                    parts = inner.rsplit("_", 1)
                    if len(parts) == 2:
                        return f"{parts[0]} ({parts[1]})"
                    return inner
                return name

            raw_features = list(preprocessor.get_feature_names_out())
            feature_names = [clean_feature_name(f) for f in raw_features]
            coefs = model.coef_
            
            if len(coefs.shape) > 1:
                if coefs.shape[0] == 1:
                    coef_values = coefs[0].tolist()
                else:
                    coef_values = coefs[0].tolist()
            else:
                coef_values = coefs.tolist()
                
            intercept = float(model.intercept_[0]) if hasattr(model.intercept_, "__len__") else float(model.intercept_)
            
            coefficients_list = []
            for feat, val in zip(feature_names, coef_values):
                coefficients_list.append({
                    "feature": feat,
                    "coefficient": float(val)
                })
                
            coefficients_list.sort(key=lambda x: abs(x["coefficient"]), reverse=True)
            
            baseline_coefficients = {
                "intercept": intercept,
                "coefficients": coefficients_list
            }
            logger.info(f"[{session_id}] Successfully extracted {len(coefficients_list)} baseline coefficients.")
        except Exception as coef_err:
            logger.warning(f"[{session_id}] Failed to extract baseline coefficients: {coef_err}", exc_info=True)

        # Store for SHAP analysis
        model_store[f"{session_id}_best_pipeline"] = best_pipeline
        model_store[f"{session_id}_X"] = X_clean
        model_store[f"{session_id}_y"] = y
        model_store[f"{session_id}_task"] = output.task
        
        # Store metrics and results for insights/chatbot
        model_results_store[session_id] = {
            "task": output.task,
            "leakage": output.leakage_flags,
            "results": output.results,
            "best": output.best,
            "class_imbalance": output.class_imbalance,
            "baseline_coefficients": baseline_coefficients,
        }

        # ── Persist experiment runs to Supabase (fire-and-forget) ─────────
        # Only runs when the session is tied to a saved project (project_id provided).
        # Uses raise_on_error=False so a Supabase failure never breaks the training response.
        if request.project_id:
            primary_metric = output.best.get("primary_metric", "")
            try:
                for r in output.results:
                    model_primary_score = r.get("metrics", {}).get(primary_metric, 0.0) or 0.0
                    supabase_request(
                        "POST",
                        "experiment_runs",
                        body={
                            "project_id": request.project_id,
                            "model_name": r.get("model", ""),
                            "hyperparameters": {},  # defaults; tuned params stored separately
                            "metrics": r.get("metrics", {}),
                            "task": output.task,
                            "primary_metric": primary_metric,
                            "primary_score": float(model_primary_score),
                        },
                        headers={"Prefer": "return=minimal"},
                        raise_on_error=False,
                    )
                logger.info(
                    f"[{session_id}] Persisted {len(output.results)} experiment run(s) "
                    f"for project {request.project_id}"
                )
            except Exception as _persist_err:
                # Log but never surface to the caller — training results are primary.
                logger.warning(
                    f"[{session_id}] Failed to persist experiment runs: {_persist_err}"
                )

        logger.info(f"[{session_id}] Pipeline complete. Task: {output.task}, Leakage flags: {len(output.leakage_flags)}")
        
        return ModelResponse(
            task=output.task,
            leakage=output.leakage_flags,
            results=output.results,
            best=output.best,
            class_imbalance=output.class_imbalance,
            baseline_coefficients=baseline_coefficients,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Error during modeling: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Modeling error: {str(e)}")


@router.post("/export/code/{session_id}")
async def export_code(session_id: str, request: ExportCodeRequest, x_user_id: str = Header(None)):
    """
    Generates a standalone Python script that reproduces the preprocessing,
    modeling training, and validation visualizations on raw data.
    """
    verify_session_owner(session_id, x_user_id)
    try:
        logger.info(f"[{session_id}] Code reproduction export request received for target: {request.target}")
        
        # Build comment list of exclusions
        exclusions_comments = []
        all_excluded_names = []
        
        # Pull leakage reasons
        leakage_reasons = {flag.get("column"): flag.get("reason", "Leakage flag") for flag in request.leakage if flag.get("column")}
        
        # Add leakage flags first
        for col_name, reason in leakage_reasons.items():
            exclusions_comments.append(f"#   - {col_name}: {reason}")
            all_excluded_names.append(col_name)
            
        # Add user-excluded features next
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
        raise HTTPException(status_code=500, detail=f"Failed to export reproduction code: {str(e)}")
