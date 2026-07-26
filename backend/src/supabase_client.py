"""
Shared Supabase HTTP client for backend routers.

Uses the service role key (bypasses RLS) to allow server-side administrative
writes such as persisting experiment runs and project versions.

Import pattern:
    from src.supabase_client import supabase_request
"""

import json
import logging
import os
import urllib.error
import urllib.request

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def supabase_request(
    method: str,
    path: str,
    body: dict = None,
    headers: dict = None,
    raise_on_error: bool = True,
):
    """
    Makes a synchronous HTTP request to the Supabase PostgREST API using urllib.
    Uses the service role key to bypass RLS for secure backend administrative tasks.

    Parameters
    ----------
    method         : HTTP method ("GET", "POST", "PATCH", "DELETE").
    path           : PostgREST path, e.g. "experiment_runs" or
                     "projects?id=eq.{uuid}".
    body           : Optional dict to JSON-encode as the request body.
    headers        : Optional extra headers to merge (e.g. {"Prefer": "return=representation"}).
    raise_on_error : If True (default), raises HTTPException on non-2xx responses.
                     If False, returns None on error (useful for fire-and-forget writes).

    Returns
    -------
    Parsed JSON response (list or dict), or None for empty responses.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        msg = "Supabase environment variables (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) not configured"
        logger.error(msg)
        if raise_on_error:
            raise HTTPException(status_code=500, detail=msg)
        return None

    full_url = f"{url}/rest/v1/{path}"
    default_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if headers:
        default_headers.update(headers)

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        full_url, data=data, headers=default_headers, method=method
    )
    try:
        with urllib.request.urlopen(req) as response:
            resp_data = response.read().decode("utf-8")
            if resp_data:
                return json.loads(resp_data)
            return None
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        logger.error(f"Supabase HTTP Error: status={e.code}, body={err_msg}")
        if not raise_on_error:
            return None
        try:
            err_json = json.loads(err_msg)
            detail = err_json.get("message", err_msg)
        except Exception:
            detail = err_msg
        raise HTTPException(status_code=e.code, detail=f"Supabase error: {detail}")
    except Exception as e:
        logger.error(f"Failed to communicate with Supabase: {str(e)}", exc_info=True)
        if not raise_on_error:
            return None
        raise HTTPException(
            status_code=500,
            detail=f"Failed to communicate with Supabase: {str(e)}",
        )
