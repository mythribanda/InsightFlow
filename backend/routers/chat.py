import logging
import os
import re
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

        try:
            result_df = con.execute(query).fetchdf()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"SQL error: {str(e)}")
        finally:
            con.close()

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
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] SQL query failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")
