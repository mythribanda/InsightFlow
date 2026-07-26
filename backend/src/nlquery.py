"""
NL Query module: Generates pandas code using the Groq API from a natural language query
and executes it in a restricted namespace.
"""

import os
import json
import urllib.request
import numpy as np
import pandas as pd
from typing import Dict, List, Any


def load_env():
    """Manually parse .env file to load API keys if not present in os.environ."""
    for path in [".env", "../.env", "backend/.env"]:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            # Strip quotes
                            val = v.strip().strip("'\"")
                            os.environ[k.strip()] = val
            except Exception as e:
                print(f"Failed to load env from {path}: {e}")


def build_schema_string(df: pd.DataFrame) -> str:
    """Builds a schema description including columns, dtypes, and 2-3 sample values."""
    schema_parts = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        # Drop missing values to get clean samples
        samples = df[col].dropna().head(3).tolist()
        # Convert values to serializable types
        clean_samples = []
        for s in samples:
            if isinstance(s, (np.integer, np.floating)):
                clean_samples.append(s.item())
            elif isinstance(s, (pd.Timestamp, str)):
                clean_samples.append(str(s))
            else:
                clean_samples.append(s)
        samples_str = ", ".join([repr(s) for s in clean_samples])
        schema_parts.append(f"- Column '{col}' (dtype: {dtype}), sample values: [{samples_str}]")
    return "\n".join(schema_parts)


def clean_generated_code(raw_code: str) -> str:
    """Cleans code block markdown markers (like ```python) and trailing statements."""
    lines = raw_code.strip().split("\n")
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


def generate_pandas_code(question: str, df: pd.DataFrame, api_key: str) -> str:
    """Prompts Groq to return ONLY pandas code assigning to result, operating on df."""
    schema_str = build_schema_string(df)

    prompt = f"""You are a Python code generator for pandas. Your task is to output Python code that answers the user's question about a DataFrame `df`.

Here is the schema of the DataFrame `df`:
{schema_str}

User's Question:
"{question}"

Instructions:
1. Generate valid Python code using pandas that operates on `df` and assigns the final answer to a variable named `result`.
2. Do NOT import pandas, numpy, or any other libraries. Assume `pd` and `np` are already imported.
3. Do NOT define `df`. Assume `df` is already loaded and contains the data matching the schema above.
4. Return ONLY the raw Python code. Do NOT wrap the code in markdown code blocks (like ```python) and do NOT write any explanations or other text.
5. The code must end by assigning the result to the variable `result`.

Example:
If the user asks "which columns have missing values", return:
result = df.columns[df.isna().any()].tolist()

If the user asks "top 5 rows by age", return:
result = df.nlargest(5, 'age')
"""

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    # Use llama-3.1-8b-instant for quick and correct code completion
    data = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            raw_code = res_data["choices"][0]["message"]["content"]
            return clean_generated_code(raw_code)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        raise Exception(f"Groq API HTTP Error {e.code}: {err_body}")
    except Exception as e:
        raise Exception(f"Failed to generate pandas code from Groq: {e}")


def execute_pandas_code(code: str, df: pd.DataFrame) -> Any:
    """
    Executes the generated code with exec in a restricted namespace.
    """
    # Namespace exposing only df, pd, np
    locs = {"df": df, "pd": pd, "np": np}
    
    # Add a code comment: restricted-builtins is a guard, not a real sandbox; do not deploy publicly without one.
    # restricted-builtins is a guard, not a real sandbox; do not deploy publicly without one.
    globs = {"__builtins__": {}}

    try:
        exec(code, globs, locs)
    except Exception as e:
        raise Exception(f"Execution Error: {e}")

    if "result" not in locs:
        raise Exception("The generated code ran but failed to assign the answer to the 'result' variable.")

    return locs["result"]


def serialize_result(result: Any) -> Any:
    """Serializes execution result into standard JSON types."""
    if isinstance(result, pd.DataFrame):
        return {
            "type": "dataframe",
            "data": result.replace({np.nan: None}).to_dict(orient="records"),
            "columns": result.columns.tolist()
        }
    elif isinstance(result, pd.Series):
        return {
            "type": "series",
            "data": result.replace({np.nan: None}).to_dict()
        }
    elif isinstance(result, (np.integer, np.floating)):
        return result.item()
    elif isinstance(result, np.ndarray):
        return result.tolist()
    elif isinstance(result, list):
        return [serialize_result(x) for x in result]
    elif isinstance(result, dict):
        return {k: serialize_result(v) for k, v in result.items()}
    else:
        # Check if float NaN
        if isinstance(result, float) and np.isnan(result):
            return None
        return result
