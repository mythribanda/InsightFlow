import csv
import json
import urllib.request
import urllib.error
import time
import pandas as pd

def run_test():
    csv_file = "demo-employee-data.csv"
    print("Reading demo-employee-data.csv...")
    
    # Read columns
    columns = {}
    with open(csv_file, mode='r', encoding='utf-8') as f:
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
                            
    session_id = f"test_session_groq"
    
    # 1. Start Analysis
    print(f"Uploading data to /analyze/{session_id}...")
    req = urllib.request.Request(
        f"http://localhost:8000/analyze/{session_id}",
        data=json.dumps({"data": columns}).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req) as resp:
        print("Analyze POST status:", resp.status)
        
    # 2. Wait for completion
    print("Waiting for analysis to complete...")
    for _ in range(30):
        time.sleep(1)
        req = urllib.request.Request(f"http://localhost:8000/analyze/{session_id}", method='GET')
        with urllib.request.urlopen(req) as resp:
            status_res = json.loads(resp.read().decode('utf-8'))
            if status_res.get("status") == "completed":
                print("Analysis complete!")
                break
    else:
        print("Analysis timed out.")
        return

    question = "what is the median salary by department"
    
    # 3. Query 1
    print(f"\n--- Query 1: '{question}' ---")
    req = urllib.request.Request(
        f"http://localhost:8000/query/{session_id}",
        data=json.dumps({"question": question}).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req) as resp:
            res1 = json.loads(resp.read().decode('utf-8'))
            print("Generated Code (Run 1):")
            print(res1.get("code"))
            print("\nResult (Run 1):")
            print(json.dumps(res1.get("result"), indent=2))
    except urllib.error.HTTPError as e:
        print("Query 1 failed:", e.code, e.read().decode('utf-8'))
        return

    # 4. Query 2
    print(f"\n--- Query 2: '{question}' ---")
    req = urllib.request.Request(
        f"http://localhost:8000/query/{session_id}",
        data=json.dumps({"question": question}).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req) as resp:
            res2 = json.loads(resp.read().decode('utf-8'))
            print("Generated Code (Run 2):")
            print(res2.get("code"))
            print("\nResult (Run 2):")
            print(json.dumps(res2.get("result"), indent=2))
    except urllib.error.HTTPError as e:
        print("Query 2 failed:", e.code, e.read().decode('utf-8'))
        return

    # 5. Hand verification using local pandas
    print("\n--- Hand Verification (Local Pandas) ---")
    df = pd.read_csv(csv_file)
    local_result = df.groupby("department")["salary"].median()
    print("Expected pandas median salary result:")
    print(local_result.to_dict())

if __name__ == "__main__":
    run_test()
