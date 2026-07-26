"""
Experiment runs router.

GET /experiments/{project_id}
  Returns all experiment_runs rows for a project, ordered newest-first.
  Auth: verifies x-user-id matches the project's user_id in Supabase.

DELETE /experiments/{project_id}/runs/{run_id}
  Deletes a single experiment run (for future clean-up UX).
"""

import logging
import os
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Header, Query

from src.supabase_client import supabase_request
from src.nlquery import load_env

logger = logging.getLogger(__name__)
router = APIRouter()

load_env()


def _verify_project_owner(project_id: str, x_user_id: str) -> dict:
    """
    Fetches the project from Supabase and verifies that x_user_id is the owner.
    Returns the project row if valid, raises 403/404 otherwise.
    """
    if not x_user_id:
        raise HTTPException(status_code=403, detail="Missing x-user-id header")

    rows = supabase_request(
        "GET",
        f"projects?id=eq.{quote(project_id)}&select=id,user_id&limit=1",
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    project = rows[0]
    if project.get("user_id") != x_user_id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: you do not own this project",
        )
    return project


@router.get("/experiments/{project_id}")
async def get_experiment_runs(
    project_id: str,
    limit: int = Query(default=200, ge=1, le=500),
    model_name: Optional[str] = Query(default=None),
    x_user_id: str = Header(None),
) -> list:
    """
    Returns experiment runs for a project ordered by created_at desc.

    Query params:
        limit      : max rows to return (1–500, default 200)
        model_name : optional filter by model name
    """
    _verify_project_owner(project_id, x_user_id)

    try:
        path = (
            f"experiment_runs"
            f"?project_id=eq.{quote(project_id)}"
            f"&order=created_at.desc"
            f"&limit={limit}"
            f"&select=id,model_name,hyperparameters,metrics,task,primary_metric,primary_score,created_at"
        )
        if model_name:
            path += f"&model_name=eq.{quote(model_name)}"

        rows = supabase_request("GET", path) or []
        logger.info(
            f"[experiments] Fetched {len(rows)} run(s) for project {project_id}"
        )
        return rows

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"[experiments] Error fetching runs for project {project_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Failed to fetch experiment runs: {str(e)}")


@router.delete("/experiments/{project_id}/runs/{run_id}", status_code=204)
async def delete_experiment_run(
    project_id: str,
    run_id: str,
    x_user_id: str = Header(None),
):
    """
    Deletes a single experiment run. The RLS policy ensures only the project
    owner can delete, but we double-check here via _verify_project_owner.
    """
    _verify_project_owner(project_id, x_user_id)

    try:
        supabase_request(
            "DELETE",
            f"experiment_runs?id=eq.{quote(run_id)}&project_id=eq.{quote(project_id)}",
        )
        logger.info(f"[experiments] Deleted run {run_id} from project {project_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[experiments] Delete error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete run: {str(e)}")
