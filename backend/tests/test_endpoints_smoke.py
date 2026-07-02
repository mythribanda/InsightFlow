import urllib.request
import urllib.parse
import json
import time
import sys

BASE_URL = "http://127.0.0.1:8000"
SESSION_ID = "session_ci-user-123_88888888-8888-8888-8888-888888888888"

def send_request(url, method="GET", data=None):
    import os
    headers = {
        "Content-Type": "application/json",
        "x-user-id": "ci-user-123"
    }
    secret = os.getenv("INTERNAL_API_SECRET")
    if secret:
        headers["x-internal-secret"] = secret
    req_data = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")
            return e.code, body
        except:
            return e.code, str(e)
    except Exception as e:
        return 999, str(e)

def run_test():
    print("=== STARTING ENDPOINT SMOKE TEST ===")
    
    # 1. Health check
    status, body = send_request(f"{BASE_URL}/health")
    print(f"GET /health: status={status}")
    if status == 404 or status >= 500:
        print("❌ FAILED: Health check returned server error or not found")
        sys.exit(1)
    
    payload = {
        "data": {
            "age": [25, 30, 45, 22, 28, 35, 40, 50, 60, 18],
            "salary": [50000, 60000, 80000, 45000, 55000, 70000, 75000, 95000, 120000, 38000],
            "name": ["Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack"],
            "label": [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
        }
    }
    
    # 2. POST /analyze/{session_id}
    status, body = send_request(f"{BASE_URL}/analyze/{SESSION_ID}", method="POST", data=payload)
    print(f"POST /analyze/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        print("❌ FAILED: Ingestion endpoint failed")
        sys.exit(1)
    
    # Give a tiny sleep for background job
    time.sleep(1)
    
    # 3. GET /analyze/{session_id}
    status, body = send_request(f"{BASE_URL}/analyze/{SESSION_ID}")
    print(f"GET /analyze/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 4. GET /anomaly/{session_id}
    status, body = send_request(f"{BASE_URL}/anomaly/{SESSION_ID}")
    print(f"GET /anomaly/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 5. POST /story/{session_id}
    status, body = send_request(f"{BASE_URL}/story/{SESSION_ID}", method="POST")
    print(f"POST /story/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 6. GET /export/clean-csv/{session_id}
    status, body = send_request(f"{BASE_URL}/export/clean-csv/{SESSION_ID}?excluded_features=name")
    print(f"GET /export/clean-csv/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 7. POST /suitability/{session_id}
    suitability_payload = {
        "target": "label",
        "data": payload["data"]
    }
    status, body = send_request(f"{BASE_URL}/suitability/{SESSION_ID}", method="POST", data=suitability_payload)
    print(f"POST /suitability/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 8. POST /recommend/{session_id}
    status, body = send_request(f"{BASE_URL}/recommend/{SESSION_ID}", method="POST", data=suitability_payload)
    print(f"POST /recommend/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 9. POST /model/{session_id}
    model_payload = {
        "target": "label",
        "data": payload["data"],
        "cv_splits": 2
    }
    status, body = send_request(f"{BASE_URL}/model/{SESSION_ID}", method="POST", data=model_payload)
    print(f"POST /model/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 10. POST /export/code/{session_id}
    code_payload = {
        "target": "label",
        "excluded_features": [],
        "leakage": [],
        "best_model_name": "LogisticRegression",
        "task": "classification"
    }
    status, body = send_request(f"{BASE_URL}/export/code/{SESSION_ID}", method="POST", data=code_payload)
    print(f"POST /export/code/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 11. POST /shap/{session_id}
    shap_payload = {"sample_idx": 0}
    status, body = send_request(f"{BASE_URL}/shap/{SESSION_ID}", method="POST", data=shap_payload)
    print(f"POST /shap/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 12. POST /visualize/{session_id}
    viz_payload = {
        "column1": "age",
        "column2": "salary",
        "chart_type": "scatter"
    }
    status, body = send_request(f"{BASE_URL}/visualize/{SESSION_ID}", method="POST", data=viz_payload)
    print(f"POST /visualize/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 13. POST /visualize/{session_id}/export-code
    status, body = send_request(f"{BASE_URL}/visualize/{SESSION_ID}/export-code", method="POST", data=viz_payload)
    print(f"POST /visualize/{{session_id}}/export-code: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 14. POST /query/{session_id}
    query_payload = {"question": "average age?"}
    status, body = send_request(f"{BASE_URL}/query/{SESSION_ID}", method="POST", data=query_payload)
    print(f"POST /query/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 15. POST /sql-query/{session_id}
    sql_payload = {"query": "SELECT AVG(age) FROM dataset"}
    status, body = send_request(f"{BASE_URL}/sql-query/{SESSION_ID}", method="POST", data=sql_payload)
    print(f"POST /sql-query/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 16. POST /cluster/{session_id}
    cluster_payload = {
        "columns": ["age", "salary"],
        "method": "kmeans",
        "n_clusters": 2
    }
    status, body = send_request(f"{BASE_URL}/cluster/{SESSION_ID}", method="POST", data=cluster_payload)
    print(f"POST /cluster/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 17. POST /cluster/optimal-k/{session_id}
    ok_payload = {"columns": ["age", "salary"]}
    status, body = send_request(f"{BASE_URL}/cluster/optimal-k/{SESSION_ID}", method="POST", data=ok_payload)
    print(f"POST /cluster/optimal-k/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 18. GET /export/clustered-csv/{session_id}
    status, body = send_request(f"{BASE_URL}/export/clustered-csv/{SESSION_ID}")
    print(f"GET /export/clustered-csv/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 19. GET /text-analysis/{session_id}/{column}
    text_payload = {
        "data": {
            "comments": ["this is good", "terrible project", "highly recommend", "not recommended", "amazing work", "awful service"],
            "rating": [5, 1, 5, 2, 5, 1]
        }
    }
    text_session_id = "session_ci-user-123_text-session"
    send_request(f"{BASE_URL}/analyze/{text_session_id}", method="POST", data=text_payload)
    time.sleep(1)
    status, body = send_request(f"{BASE_URL}/text-analysis/{text_session_id}/comments")
    print(f"GET /text-analysis/{{session_id}}/{{column}}: status={status}")
    send_request(f"{BASE_URL}/session/{text_session_id}", method="DELETE")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 20. POST /calc-column/{session_id}
    calc_payload = {
        "name": "double_age",
        "formula": "age * 2",
        "data": payload["data"]
    }
    status, body = send_request(f"{BASE_URL}/calc-column/{SESSION_ID}", method="POST", data=calc_payload)
    print(f"POST /calc-column/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)
    
    # 21. DELETE /session/{session_id}
    status, body = send_request(f"{BASE_URL}/session/{SESSION_ID}", method="DELETE")
    print(f"DELETE /session/{{session_id}}: status={status}")
    if status == 404 or status >= 500:
        sys.exit(1)

    print("\n=== SMOKE TEST PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_test()
