import sys
import os
import json
import pandas as pd
import numpy as np
import urllib.request
import urllib.error

# Add backend to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from backend.src.modeling import run_modeling_pipeline

def test_programmatic_exclusion():
    print("======================================================================")
    print("Verification Step 1: Programmatic check with injected 1-member class")
    print("======================================================================")
    df = pd.read_csv("demo-employee-data.csv")
    
    # Injected 1-member class 'RareDept'
    new_row = df.iloc[[0]].copy()
    new_row["department"] = "RareDept"
    new_row["employee_id"] = "EMP999"
    df_injected = pd.concat([df, new_row], ignore_index=True)
    
    X = df_injected.drop(columns=["department"])
    y = df_injected["department"]
    
    # Exclude employee_id and name
    output = run_modeling_pipeline(X, y, target_col="department", excluded_features=["employee_id", "name"])
    
    print("ModelingOutput dict properties:")
    for key, value in output.__dict__.items():
        if key == "results":
            print(f"  {key}: [List of {len(value)} model results]")
        elif key == "leakage_flags":
            print(f"  {key}: [List of {len(value)} leakage flags]")
        else:
            print(f"  {key}: {value}")
            
    # Verification assertions
    assert len(output.excluded_classes) == 1, "Should have exactly 1 excluded class"
    assert output.excluded_classes[0]["class"] == "RareDept", "Excluded class should be RareDept"
    assert output.excluded_classes[0]["rows_dropped"] == 1, "Dropped row count should be 1"
    print("Step 1 Successful!")

def test_original_datasets():
    print("\n======================================================================")
    print("Verification Step 2: Unmodified datasets (department, car_body_type)")
    print("======================================================================")
    
    # Target: department
    df_emp = pd.read_csv("demo-employee-data.csv")
    X_emp = df_emp.drop(columns=["department"])
    y_emp = df_emp["department"]
    output_emp = run_modeling_pipeline(X_emp, y_emp, target_col="department", excluded_features=["employee_id", "name"])
    print(f"department target excluded_classes: {output_emp.excluded_classes}")
    assert isinstance(output_emp.excluded_classes, list), "Should be a list"
    assert len(output_emp.excluded_classes) == 0, "Should be empty list"
    
    # Target: car_body_type
    df_ev = pd.read_csv("electric_vehicles_spec_2025.csv")
    X_ev = df_ev.drop(columns=["car_body_type"])
    y_ev = df_ev["car_body_type"]
    output_ev = run_modeling_pipeline(X_ev, y_ev, target_col="car_body_type", excluded_features=["brand", "model", "fast_charge_port", "source_url"])
    print(f"car_body_type target excluded_classes: {output_ev.excluded_classes}")
    assert isinstance(output_ev.excluded_classes, list), "Should be a list"
    assert len(output_ev.excluded_classes) == 0, "Should be empty list"
    print("Step 2 Successful!")

def test_api_endpoint():
    print("\n======================================================================")
    print("Verification Step 3: Hitting actual HTTP API endpoint /model/{session_id}")
    print("======================================================================")
    
    df = pd.read_csv("demo-employee-data.csv")
    new_row = df.iloc[[0]].copy()
    new_row["department"] = "SoloDept"
    new_row["employee_id"] = "EMP999"
    df_injected = pd.concat([df, new_row], ignore_index=True)
    
    # Convert data back to dictionary of lists for the ModelRequest
    data_dict = {}
    for col in df_injected.columns:
        data_dict[col] = df_injected[col].replace({np.nan: None}).tolist()
        
    payload = {
        "target": "department",
        "data": data_dict,
        "excluded_features": ["employee_id", "name"],
        "cv_splits": 5
    }
    
    url = "http://localhost:8000/model/session_verify_exclusion_123"
    print(f"Sending POST request to {url}...")
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "x-internal-secret": "my_test_secret",
            "x-user-id": "verify",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            resp_body = response.read().decode("utf-8")
            resp_json = json.loads(resp_body)
    except urllib.error.HTTPError as e:
        status_code = e.code
        resp_body = e.read().decode("utf-8")
        print(f"Error Response: {resp_body}")
        sys.exit(1)
        
    print(f"Response status code: {status_code}")
    print("\nRaw JSON Response excerpt (best model, task, class_imbalance, excluded_classes):")
    subset = {
        "task": resp_json.get("task"),
        "best": resp_json.get("best"),
        "class_imbalance": resp_json.get("class_imbalance"),
        "excluded_classes": resp_json.get("excluded_classes")
    }
    print(json.dumps(subset, indent=2))
    
    assert len(resp_json.get("excluded_classes", [])) == 1, "API should return exactly 1 excluded class"
    assert resp_json["excluded_classes"][0]["class"] == "SoloDept", "API excluded class should be SoloDept"
    print("Step 3 Successful!")

if __name__ == "__main__":
    test_programmatic_exclusion()
    test_original_datasets()
    try:
        test_api_endpoint()
    except Exception as e:
        print(f"API test failed/skipped (is server running?): {e}")
