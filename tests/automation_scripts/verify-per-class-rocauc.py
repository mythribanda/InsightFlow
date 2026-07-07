import sys
import os
import json
import pandas as pd
import numpy as np

# Add backend to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from backend.src.modeling import run_modeling_pipeline, evaluate_model_cv, LeakageSafePipeline

def test_car_body_type():
    print("======================================================================")
    print("Verification Step 1: car_body_type (8 classes, rarest has 2 members)")
    print("======================================================================")
    df = pd.read_csv("electric_vehicles_spec_2025.csv")
    X = df.drop(columns=["car_body_type"])
    y = df["car_body_type"]
    
    # Exclude high-cardinality and text identifiers
    excluded = ["brand", "model", "fast_charge_port", "source_url"]
    
    # Call run_modeling_pipeline with cv_splits=5
    output = run_modeling_pipeline(X, y, target_col="car_body_type", excluded_features=excluded, cv_splits=5)
    
    # Show output results
    for r in output.results:
        print(f"\nModel: {r['model']}")
        print(f"  accuracy: {r['metrics']['accuracy']:.4f} ± {r['std']['accuracy']:.4f}")
        print(f"  f1: {r['metrics']['f1']:.4f} ± {r['std']['f1']:.4f}")
        print(f"  balanced_accuracy: {r['metrics']['balanced_accuracy']:.4f} ± {r['std']['balanced_accuracy']:.4f}")
        print(f"  roc_auc: {r['metrics']['roc_auc']:.4f} ± {r['std']['roc_auc']:.4f}")
        print(f"  roc_auc_fold_coverage: {r['roc_auc_fold_coverage']}")
        print(f"  roc_auc_class_coverage: {r['roc_auc_class_coverage']}")
        
        # Details per fold
        fold_scores = r['fold_scores']
        print(f"  Per-fold accuracy scores: {[round(s, 4) for s in fold_scores['accuracy']]}")
        print(f"  Per-fold roc_auc scores: {[round(s, 4) if not np.isnan(s) else 'NaN' for s in fold_scores['roc_auc']]}")

    # Let's perform manual fold analysis to show which classes qualified per fold
    print("\n--- Detailed Class Qualification analysis per fold ---")
    classes_all = np.unique(y)
    print(f"All classes ({len(classes_all)} total): {list(classes_all)}")
    
    # Re-run evaluate_model_cv manually to inspect class qualification details per fold
    pipeline = LeakageSafePipeline.build_boosting_pipeline(X.drop(columns=excluded, errors="ignore"), y, "classification")
    
    from sklearn.model_selection import KFold
    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    for fold_idx, (train_idx, test_idx) in enumerate(cv.split(X, y)):
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
        pipeline.fit(X.iloc[train_idx].drop(columns=excluded, errors="ignore"), y_train)
        model_classes = list(pipeline.classes_)
        
        qualified_classes = []
        excluded_classes = []
        for cls in classes_all:
            if cls in model_classes and (y_test == cls).any():
                y_test_binary = (y_test == cls).astype(int)
                if y_test_binary.nunique() > 1:
                    qualified_classes.append(cls)
                else:
                    excluded_classes.append(cls)
            else:
                excluded_classes.append(cls)
                
        print(f"Fold {fold_idx + 1}:")
        print(f"  Qualified classes ({len(qualified_classes)}): {qualified_classes}")
        print(f"  Excluded classes ({len(excluded_classes)}): {excluded_classes}")

def test_department():
    print("\n======================================================================")
    print("Verification Step 2: department target (5 balanced classes)")
    print("======================================================================")
    df = pd.read_csv("demo-employee-data.csv")
    X = df.drop(columns=["department"])
    y = df["department"]
    excluded = ["employee_id", "name"]
    
    output = run_modeling_pipeline(X, y, target_col="department", excluded_features=excluded, cv_splits=5)
    
    for r in output.results:
        print(f"\nModel: {r['model']}")
        print(f"  accuracy: {r['metrics']['accuracy']:.4f} ± {r['std']['accuracy']:.4f}")
        print(f"  roc_auc: {r['metrics']['roc_auc']:.4f} ± {r['std']['roc_auc']:.4f}")
        print(f"  roc_auc_fold_coverage: {r['roc_auc_fold_coverage']}")
        print(f"  roc_auc_class_coverage: {r['roc_auc_class_coverage']}")
        assert r['roc_auc_fold_coverage'] == "5/5"
        assert r['roc_auc_class_coverage'] == "25/25"

def test_binary_and_regression():
    print("\n======================================================================")
    print("Verification Step 3: Binary target & Regression target check")
    print("======================================================================")
    
    # Binary Classification (target: drivetrain in EV dataset)
    df_ev = pd.read_csv("electric_vehicles_spec_2025.csv")
    # Keep only FWD and RWD classes to make it strictly binary
    df_binary = df_ev[df_ev["drivetrain"].isin(["FWD", "RWD"])].reset_index(drop=True)
    X_bin = df_binary.drop(columns=["drivetrain"])
    y_bin = df_binary["drivetrain"]
    excluded_bin = ["brand", "model", "fast_charge_port", "source_url", "car_body_type"]
    
    output_bin = run_modeling_pipeline(X_bin, y_bin, target_col="drivetrain", excluded_features=excluded_bin, cv_splits=5)
    print("\nBinary classification results:")
    for r in output_bin.results:
        print(f"Model: {r['model']}")
        print(f"  roc_auc: {r['metrics']['roc_auc']:.4f}")
        print(f"  roc_auc_fold_coverage: {r['roc_auc_fold_coverage']}")
        print(f"  roc_auc_class_coverage: {r['roc_auc_class_coverage']}")
        assert r['roc_auc_fold_coverage'] == "5/5"
        assert r['roc_auc_class_coverage'] == "10/10" # 2 classes * 5 folds = 10 possible
        
    # Regression (target: salary in employee dataset)
    df_emp = pd.read_csv("demo-employee-data.csv")
    X_reg = df_emp.drop(columns=["salary"])
    y_reg = df_emp["salary"]
    excluded_reg = ["employee_id", "name"]
    
    output_reg = run_modeling_pipeline(X_reg, y_reg, target_col="salary", excluded_features=excluded_reg, cv_splits=5)
    print("\nRegression results:")
    for r in output_reg.results:
        print(f"Model: {r['model']}")
        print(f"  r2: {r['metrics']['r2']:.4f}")
        print(f"  roc_auc_fold_coverage: {r['roc_auc_fold_coverage']}")
        print(f"  roc_auc_class_coverage: {r['roc_auc_class_coverage']}")
        assert r['roc_auc_fold_coverage'] is None
        assert r['roc_auc_class_coverage'] is None

if __name__ == "__main__":
    test_car_body_type()
    test_department()
    test_binary_and_regression()
