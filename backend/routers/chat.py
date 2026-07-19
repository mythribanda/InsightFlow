import logging
import os
import re
import time
import duckdb
import pandas as pd
import numpy as np
from fastapi import APIRouter, HTTPException, Header
from state import session_data_store, verify_session_owner
from schemas import QueryRequest, SQLQueryRequest

logger = logging.getLogger(__name__)
router = APIRouter()

FORBIDDEN_SQL_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|ATTACH|COPY|EXPORT|IMPORT|PRAGMA|CALL)\b",
    re.IGNORECASE,
)


@router.post("/query/{session_id}")
async def query_dataset(session_id: str, request: QueryRequest, x_user_id: str = Header(None)):
    verify_session_owner(session_id, x_user_id)
    """
    POST /query/{session_id} -> generates pandas code using Groq and executes it.
    """
    try:
        logger.info(f"[{session_id}] NL Query request: {request.question}")
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(
                status_code=404,
                detail=f"No dataset found for session '{session_id}'. Please upload a dataset first."
            )
            
        # Get GROQ_API_KEY
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            from src.nlquery import load_env
            load_env()
            api_key = os.getenv("GROQ_API_KEY")
            
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="GROQ_API_KEY is not configured on the backend. Please set it in a .env file."
            )
            
        from src.nlquery import generate_pandas_code, execute_pandas_code, serialize_result
        
        # Generate code
        code = generate_pandas_code(request.question, df, api_key)
        
        # Execute code
        raw_result = execute_pandas_code(code, df)
        
        # Serialize
        serialized = serialize_result(raw_result)
        
        return {
            "code": code,
            "result": serialized
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] Query execution failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.post("/sql-query/{session_id}")
async def run_sql_query(session_id: str, request: SQLQueryRequest, x_user_id: str = Header(None)):
    verify_session_owner(session_id, x_user_id)
    """
    POST /sql-query/{session_id} -> runs a read-only SQL SELECT against the
    uploaded dataset using DuckDB, with the dataframe exposed as table 'dataset'.
    """
    try:
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(status_code=404, detail=f"No dataset found for session '{session_id}'.")

        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="Query cannot be empty.")

        if FORBIDDEN_SQL_KEYWORDS.search(query):
            raise HTTPException(
                status_code=400,
                detail="Only SELECT queries are allowed. DDL/DML statements (INSERT, UPDATE, DELETE, DROP, etc.) are blocked."
            )

        if not query.strip().upper().startswith("SELECT") and not query.strip().upper().startswith("WITH"):
            raise HTTPException(
                status_code=400,
                detail="Query must start with SELECT (or WITH for CTEs)."
            )

        logger.info(f"[{session_id}] SQL query: {query}")

        con = duckdb.connect()
        con.register("dataset", df)

        start_time = time.perf_counter()
        try:
            result_df = con.execute(query).fetchdf()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"SQL error: {str(e)}")
        finally:
            con.close()
        end_time = time.perf_counter()
        execution_time_ms = (end_time - start_time) * 1000.0

        # Cap rows returned to the frontend
        truncated = len(result_df) > 1000
        if truncated:
            result_df = result_df.head(1000)

        # Safe convert to JSON friendly structures
        result_df = result_df.replace({np.nan: None, np.inf: None, -np.inf: None})
        for c in result_df.columns:
            if pd.api.types.is_datetime64_any_dtype(result_df[c]):
                result_df[c] = result_df[c].astype(str).replace("NaT", None)

        return {
            "columns": result_df.columns.tolist(),
            "rows": result_df.to_dict("records"),
            "row_count": len(result_df),
            "truncated": truncated,
            "execution_time_ms": execution_time_ms,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] SQL query failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


from pydantic import BaseModel

class NLVisualizeRequest(BaseModel):
    query: str

@router.post("/nl-visualize/{session_id}")
async def generate_nl_visualization(session_id: str, request: NLVisualizeRequest, x_user_id: str = Header(None)):
    verify_session_owner(session_id, x_user_id)
    """
    POST /nl-visualize/{session_id} -> prompts Groq to recommend a dashboard visual spec
    """
    try:
        df = session_data_store.get(session_id)
        if df is None:
            raise HTTPException(
                status_code=404,
                detail=f"No dataset found for session '{session_id}'."
            )

        # Get GROQ_API_KEY
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            from src.nlquery import load_env
            load_env()
            api_key = os.getenv("GROQ_API_KEY")
            
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="GROQ_API_KEY is not configured on the backend. Please set it in a .env file."
            )

        # Build schema description
        schema_cols = list(df.columns)
        schema_desc = []
        for col in schema_cols:
            schema_desc.append(f"- '{col}' (type: {str(df[col].dtype)})")
        schema_str = "\n".join(schema_desc)

        prompt = f"""You are a visualization recommender system. Given a user query and the schema of their dataset, recommend the single best visualization widget layout.
Available columns in the dataset:
{schema_str}

User Query:
"{request.query}"

Choose from these chart types:
- "bar"
- "line"
- "pie"
- "donut"
- "scatter"
- "histogram"
- "boxplot"
- "kde"
- "table"
- "kpi"

Return a structured JSON object with the following fields:
- "chart_type": string (one of the options above)
- "x_field": string (must be an exact column name from the available columns list)
- "y_field": string or null (must be an exact column name from the available columns list, or null if none)
- "title": string (a concise title for the chart/metric card)
- "filters": list of filter objects (each filter has "column", "operator" ('in' or 'between'), and "value" (array of categories or [min, max] numbers))

Ensure the JSON is raw, valid, and contains NO other text, markdown blocks, or explanation.
Example Output:
{{
  "chart_type": "bar",
  "x_field": "Category",
  "y_field": "Sales",
  "title": "Total Sales by Category",
  "filters": []
}}
"""

        import urllib.request
        import json
        
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        data = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.0,
        }
        
        req_body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=req_body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as res:
                res_body = res.read().decode("utf-8")
                res_data = json.loads(res_body)
                content = res_data["choices"][0]["message"]["content"].strip()
                
                if content.startswith("```"):
                    lines = content.split("\n")
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    content = "\n".join(lines).strip()
                    
                parsed_spec = json.loads(content)
        except Exception as e:
            logger.error(f"Groq visualization spec generation failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate visualization spec from LLM: {str(e)}"
            )

        # Validate column names
        x_field = parsed_spec.get("x_field")
        y_field = parsed_spec.get("y_field")
        
        if x_field and x_field not in schema_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid column name returned by LLM: '{x_field}'. Available columns: {schema_cols}"
            )
        if y_field and y_field != "none" and y_field is not None and y_field not in schema_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid column name returned by LLM: '{y_field}'. Available columns: {schema_cols}"
            )

        return parsed_spec
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] NL visualization failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"NL visualization failed: {str(e)}")
