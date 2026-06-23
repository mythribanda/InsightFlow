import urllib.request
import json
import pandas as pd
import time
import sys

def run_test():
    print("Loading demo-employee-data.csv...")
    df = pd.read_csv("demo-employee-data.csv")
    
    # Convert dataframe to dict format for the endpoint
    data_dict = df.to_dict(orient="list")
    
    session_id = f"session_twice_{int(time.time())}"
    
    # Step 1: Initialize session on the backend
    analyze_url = f"http://localhost:8000/analyze/{session_id}"
    print(f"Initializing session at {analyze_url}...")
    
    req_data = json.dumps({"data": data_dict}).encode("utf-8")
    req = urllib.request.Request(
        analyze_url,
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as res:
            print("Session initialized:", res.read().decode("utf-8"))
    except Exception as e:
        print("Failed to initialize session. Make sure backend is running on http://localhost:8000.", file=sys.stderr)
        print(e, file=sys.stderr)
        sys.exit(1)
        
    # Wait briefly for background profiling to complete (though query only needs cached df)
    time.sleep(1)
    
    # Step 2: Query 1
    query_url = f"http://localhost:8000/query/{session_id}"
    payload = {"question": "median salary by department"}
    
    print("\n--- Sending Question 1: 'median salary by department' ---")
    req_q1 = urllib.request.Request(
        query_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req_q1) as res:
            res_json1 = json.loads(res.read().decode("utf-8"))
            code1 = res_json1["code"]
            result1 = res_json1["result"]
    except Exception as e:
        print("Query 1 failed:", e, file=sys.stderr)
        sys.exit(1)
        
    # Step 3: Query 2 (identical question)
    print("\n--- Sending Question 2: 'median salary by department' ---")
    req_q2 = urllib.request.Request(
        query_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req_q2) as res:
            res_json2 = json.loads(res.read().decode("utf-8"))
            code2 = res_json2["code"]
            result2 = res_json2["result"]
    except Exception as e:
        print("Query 2 failed:", e, file=sys.stderr)
        sys.exit(1)
        
    # Print side-by-side or clean comparison
    print("\n" + "="*80)
    print("COMPARISON OF CONSECUTIVE QUERIES")
    print("="*80)
    print(f"{'Run 1':<40} | {'Run 2':<40}")
    print("-"*80)
    print(f"Generated Code:\n{code1:<40} | {code2:<40}")
    print("-"*80)
    print("Result:")
    
    # Format results to display nicely
    def format_res(res_data):
        if isinstance(res_data, dict) and res_data.get("type") == "series":
            data = res_data["data"]
            return ", ".join(f"{k}: {v}" for k, v in data.items())
        return str(res_data)
        
    fmt1 = format_res(result1)
    fmt2 = format_res(result2)
    
    # Wrap results if they are too long
    chunk_size = 38
    fmt1_chunks = [fmt1[i:i+chunk_size] for i in range(0, len(fmt1), chunk_size)]
    fmt2_chunks = [fmt2[i:i+chunk_size] for i in range(0, len(fmt2), chunk_size)]
    
    for i in range(max(len(fmt1_chunks), len(fmt2_chunks))):
        c1 = fmt1_chunks[i] if i < len(fmt1_chunks) else ""
        c2 = fmt2_chunks[i] if i < len(fmt2_chunks) else ""
        print(f"{c1:<40} | {c2:<40}")
    print("="*80)

if __name__ == "__main__":
    run_test()
