import csv
import json
import urllib.request
import urllib.error
import time
import random

def run_verification():
    csv_file_path = "c:/Users/Mythri Banda/OneDrive/Desktop/github projects/InsightFlow/demo-employee-data.csv"
    
    # 1. Parse CSV into dictionary of columns
    print(f"Reading CSV from {csv_file_path}...")
    columns = {}
    with open(csv_file_path, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        for h in headers:
            columns[h] = []
        for row in reader:
            for idx, val in enumerate(row):
                if idx < len(headers):
                    col_name = headers[idx]
                    if val == '':
                        columns[col_name].append(None)
                    else:
                        try:
                            if '.' in val:
                                columns[col_name].append(float(val))
                            else:
                                columns[col_name].append(int(val))
                        except ValueError:
                            columns[col_name].append(val)
                            
    row_count = len(columns[headers[0]])
    print(f"Parsed {row_count} rows across columns: {', '.join(headers)}")
    
    # 2. Generate a random session ID
    session_id = f"test_session_{random.randint(1000, 9999)}"
    print(f"Using session ID: {session_id}")
    
    # 3. Start Analysis (POST /analyze/{session_id})
    analyze_url = f"http://localhost:8000/analyze/{session_id}"
    payload = {"data": columns}
    req = urllib.request.Request(
        analyze_url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    print(f"Sending analysis request to {analyze_url}...")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print("Analyze Response:", data)
    except urllib.error.HTTPError as e:
        print("Analyze request failed:", e.code, e.read().decode('utf-8'))
        return

    # 4. Poll status (GET /analyze/{session_id})
    print("Polling analysis status...")
    completed = False
    for _ in range(30):
        time.sleep(1)
        req = urllib.request.Request(analyze_url, method='GET')
        try:
            with urllib.request.urlopen(req) as resp:
                status_res = json.loads(resp.read().decode('utf-8'))
                print("Status:", status_res.get("status"))
                if status_res.get("status") == "completed":
                    completed = True
                    break
        except urllib.error.HTTPError as e:
            print("Status poll failed:", e.code, e.read().decode('utf-8'))
            return
            
    if not completed:
        print("Analysis timed out.")
        return

    # 5. Retrieve Anomaly Report (GET /anomaly/{session_id}?contamination=0.05)
    anomaly_url = f"http://localhost:8000/anomaly/{session_id}?contamination=0.05"
    print(f"Fetching anomaly report from {anomaly_url}...")
    try:
        req = urllib.request.Request(anomaly_url, method='GET')
        with urllib.request.urlopen(req) as resp:
            anomalies = json.loads(resp.read().decode('utf-8'))
            print(f"Successfully retrieved anomaly report. Found {len(anomalies)} anomalies.")
    except urllib.error.HTTPError as e:
        print("Anomaly scan failed:", e.code, e.read().decode('utf-8'))
        return

    # 6. Run Query (POST /query/{session_id})
    query_url = f"http://localhost:8000/query/{session_id}"
    query_payload = {"question": "what is the average age of employees?"}
    print(f"Sending natural language query to {query_url}...")
    req = urllib.request.Request(
        query_url,
        data=json.dumps(query_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req) as resp:
            query_res = json.loads(resp.read().decode('utf-8'))
            print("Query Response:", query_res)
    except urllib.error.HTTPError as e:
        print("Query failed:", e.code, e.read().decode('utf-8'))
        return

    # 7. Test Targets: regression ("salary") and classification ("department")
    for target in ["salary", "department"]:
        print(f"\n--- Testing Target: {target} ---")
        
        # A. Target Suitability (POST /suitability/{session_id})
        suit_url = f"http://localhost:8000/suitability/{session_id}"
        suit_payload = {"target": target, "data": columns}
        print(f"Checking suitability for target '{target}'...")
        req = urllib.request.Request(
            suit_url,
            data=json.dumps(suit_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        try:
            with urllib.request.urlopen(req) as resp:
                suit_res = json.loads(resp.read().decode('utf-8'))
                print(f"Suitability: suitable={suit_res.get('suitable')}, task={suit_res.get('task')}")
        except urllib.error.HTTPError as e:
            print("Suitability check failed:", e.code, e.read().decode('utf-8'))
            continue

        # B. Feature Recommendation (POST /recommend/{session_id})
        rec_url = f"http://localhost:8000/recommend/{session_id}"
        rec_payload = {"target": target, "data": columns}
        print(f"Getting feature recommendations for target '{target}'...")
        req = urllib.request.Request(
            rec_url,
            data=json.dumps(rec_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        try:
            with urllib.request.urlopen(req) as resp:
                rec_res = json.loads(resp.read().decode('utf-8'))
                print("Recommendations (high signal):", rec_res.get("high_signal"))
        except urllib.error.HTTPError as e:
            print("Feature recommendation failed:", e.code, e.read().decode('utf-8'))
            continue

        # C. Model Training (POST /model/{session_id})
        model_url = f"http://localhost:8000/model/{session_id}"
        model_payload = {"target": target, "data": columns, "cv_splits": 5}
        print(f"Training models for target '{target}'...")
        req = urllib.request.Request(
            model_url,
            data=json.dumps(model_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        try:
            with urllib.request.urlopen(req) as resp:
                model_res = json.loads(resp.read().decode('utf-8'))
                print("Model Training Results (best model):", model_res.get("best"))
        except urllib.error.HTTPError as e:
            print("Model training failed:", e.code, e.read().decode('utf-8'))
            continue

        # D. SHAP Explainability (POST /shap/{session_id})
        shap_url = f"http://localhost:8000/shap/{session_id}"
        shap_payload = {"sample_idx": 0}
        print(f"Running SHAP analysis for target '{target}'...")
        req = urllib.request.Request(
            shap_url,
            data=json.dumps(shap_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        try:
            with urllib.request.urlopen(req) as resp:
                shap_res = json.loads(resp.read().decode('utf-8'))
                print(f"SHAP results: global_importance size={len(shap_res.get('global_importance') or '')} chars")
        except urllib.error.HTTPError as e:
            print("SHAP analysis failed:", e.code, e.read().decode('utf-8'))
            continue

if __name__ == "__main__":
    run_verification()
