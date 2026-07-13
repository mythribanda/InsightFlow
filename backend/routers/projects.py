import logging
import os
import json
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional
from io import StringIO
import pandas as pd
import uuid
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Header, Response
from pydantic import BaseModel

from state import session_data_store, analysis_jobs, verify_session_owner
from src.nlquery import load_env
from src.supabase_client import supabase_request

logger = logging.getLogger(__name__)
router = APIRouter()

# Load environment variables (such as SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
load_env()

def validate_uuid(val: str, name: str = "ID"):
    if not val:
        raise HTTPException(status_code=400, detail=f"Missing {name}")
    try:
        uuid.UUID(str(val))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {name} format (must be a valid UUID)")

class CreateProjectRequest(BaseModel):
    name: str
    session_id: str

class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    favorite: Optional[bool] = None
    tags: Optional[List[str]] = None

class LoadProjectRequest(BaseModel):
    session_id: str

class RestoreVersionRequest(BaseModel):
    session_id: str



def write_project_version(project_id: str, df: pd.DataFrame, analysis_result: Any, change_note: str) -> dict:
    """
    Inserts a new snapshot row into project_versions for the given project.
    Automatically computes the next sequential version_number.
    Returns the created version row.
    """
    # Get current max version number for this project
    existing = supabase_request(
        "GET",
        f"project_versions?project_id=eq.{project_id}&select=version_number&order=version_number.desc&limit=1"
    )
    next_version = 1
    if existing:
        next_version = (existing[0].get("version_number") or 0) + 1

    csv_snapshot = df.to_csv(index=False)

    version_payload = {
        "project_id": project_id,
        "version_number": next_version,
        "dataset_snapshot": csv_snapshot,
        "analysis_result": analysis_result,
        "change_note": change_note,
    }

    headers = {"Prefer": "return=representation"}
    created = supabase_request("POST", "project_versions", body=version_payload, headers=headers)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to write project version snapshot")

    logger.info(f"[project:{project_id}] Wrote version {next_version}: {change_note}")
    return created[0]


@router.get("/projects")
async def list_projects(x_user_id: str = Header(None)):
    """
    GET /projects -> Lists all projects owned by the calling user.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing calling user credentials")
    validate_uuid(x_user_id, "User ID")
    
    # Query projects table filtered by user_id
    projects = supabase_request("GET", f"projects?user_id=eq.{quote(x_user_id)}&order=created_at.desc")
    return projects or []


@router.post("/projects")
async def create_project(request: CreateProjectRequest, x_user_id: str = Header(None)):
    """
    POST /projects -> Persists a session's dataset and analysis results to Supabase.
    Also writes version 1 to project_versions.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing calling user credentials")
    validate_uuid(x_user_id, "User ID")
    
    # Verify the calling user is the owner of the active session
    verify_session_owner(request.session_id, x_user_id)
    
    # Retrieve active dataset and analysis result from memory store
    df = session_data_store.get(request.session_id)
    if df is None:
        raise HTTPException(
            status_code=404,
            detail=f"No active dataset found for session '{request.session_id}'"
        )
        
    job = analysis_jobs.get(request.session_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Session analysis is not complete yet. Cannot save."
        )
        
    analysis_result = job.get("result")
    
    # Build dataset metadata object
    cols = list(df.columns)
    rows_count = len(df)
    dataset_metadata = {
        "rows": rows_count,
        "cols": len(cols),
        "columns": cols,
        "fileName": f"{request.name}.csv"
    }
    
    # Insert project record into projects table
    project_payload = {
        "user_id": x_user_id,
        "name": request.name,
        "dataset_metadata": dataset_metadata
    }
    
    headers = {"Prefer": "return=representation"}
    created_projects = supabase_request("POST", "projects", body=project_payload, headers=headers)
    if not created_projects:
        raise HTTPException(status_code=500, detail="Failed to create project record in Supabase")
        
    project = created_projects[0]
    
    # Convert active dataframe to CSV string
    csv_data = df.to_csv(index=False)
    
    # Insert dataset record into project_datasets table (kept as live snapshot for fast load)
    dataset_payload = {
        "project_id": project["id"],
        "csv_data": csv_data,
        "analysis_result": analysis_result
    }
    
    supabase_request("POST", "project_datasets", body=dataset_payload)

    # Write version 1 snapshot
    try:
        write_project_version(project["id"], df, analysis_result, "Initial save")
    except Exception as e:
        logger.warning(f"Failed to write initial version for project {project['id']}: {e}")
    
    logger.info(f"[{request.session_id}] Saved project '{request.name}' successfully with project ID {project['id']}")
    return project


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, request: UpdateProjectRequest, x_user_id: str = Header(None)):
    """
    PATCH /projects/{project_id} -> Updates project fields (name, favorite, tags).
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing calling user credentials")
    validate_uuid(project_id, "Project ID")
    validate_uuid(x_user_id, "User ID")
        
    body = {}
    if request.name is not None:
        body["name"] = request.name
    if request.favorite is not None:
        body["favorite"] = request.favorite
    if request.tags is not None:
        body["tags"] = request.tags
        
    if not body:
        raise HTTPException(status_code=400, detail="No fields to update")

    headers = {"Prefer": "return=representation"}
    updated = supabase_request(
        "PATCH",
        f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}",
        body=body,
        headers=headers
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")
        
    return updated[0]


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, x_user_id: str = Header(None)):
    """
    DELETE /projects/{project_id} -> Deletes a project.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing calling user credentials")
    validate_uuid(project_id, "Project ID")
    validate_uuid(x_user_id, "User ID")
        
    # Delete project record from projects table
    headers = {"Prefer": "return=representation"}
    deleted = supabase_request(
        "DELETE",
        f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}",
        headers=headers
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")
        
    logger.info(f"Deleted project ID {project_id}")
    return {"status": "success", "message": "Project deleted successfully"}


@router.post("/projects/{project_id}/load")
async def load_project(project_id: str, request: LoadProjectRequest, x_user_id: str = Header(None)):
    """
    POST /projects/{project_id}/load -> Reconstructs in-memory TTLDict session states from persistent database.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing calling user credentials")
    validate_uuid(project_id, "Project ID")
    validate_uuid(x_user_id, "User ID")
        
    # 1. Retrieve the project to verify ownership
    projects = supabase_request("GET", f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}")
    if not projects:
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")
    project = projects[0]
    
    # 2. Retrieve project dataset (CSV data) and analysis result
    datasets = supabase_request("GET", f"project_datasets?project_id=eq.{quote(project_id)}")
    if not datasets:
        raise HTTPException(status_code=404, detail="Project dataset not found")
    dataset = datasets[0]
    
    # 3. Parse CSV data into DataFrame
    try:
        df = pd.read_csv(StringIO(dataset["csv_data"]))
    except Exception as e:
        logger.error(f"Failed to parse saved CSV dataset for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse stored dataset CSV: {e}")
        
    # 4. Populate in-memory stores for session ID
    session_id = request.session_id
    session_data_store[session_id] = df
    analysis_jobs[session_id] = {
        "status": "completed",
        "result": dataset["analysis_result"],
        "error": None
    }
    
    from datetime import datetime
    try:
        supabase_request(
            "PATCH",
            f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}",
            body={"last_opened_at": datetime.utcnow().isoformat() + "Z"}
        )
    except Exception as e:
        logger.warning(f"Failed to update last_opened_at for project {project_id}: {e}")

    logger.info(f"[{session_id}] Loaded project '{project['name']}' from Supabase successfully.")
    
    return {
        "project": project,
        "analysis_result": dataset["analysis_result"],
        "csv_data": dataset["csv_data"]
    }


@router.get("/projects/{project_id}/versions")
async def list_project_versions(project_id: str, x_user_id: str = Header(None)):
    """
    GET /projects/{project_id}/versions -> Returns version history for a project in descending order.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing calling user credentials")
    validate_uuid(project_id, "Project ID")
    validate_uuid(x_user_id, "User ID")

    # Verify project ownership
    projects = supabase_request("GET", f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}")
    if not projects:
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    # Fetch versions — exclude the large dataset_snapshot to keep response lightweight
    versions = supabase_request(
        "GET",
        f"project_versions?project_id=eq.{quote(project_id)}&select=id,project_id,version_number,change_note,created_at,analysis_result&order=version_number.desc"
    )
    return versions or []


@router.get("/projects/{project_id}/versions/{version_id}/snapshot")
async def get_version_snapshot(project_id: str, version_id: str, x_user_id: str = Header(None)):
    """
    GET /projects/{project_id}/versions/{version_id}/snapshot
    Returns the dataset_snapshot CSV and column metadata for a specific version (used for preview).
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing calling user credentials")
    validate_uuid(project_id, "Project ID")
    validate_uuid(version_id, "Version ID")
    validate_uuid(x_user_id, "User ID")

    # Verify project ownership
    projects = supabase_request("GET", f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}")
    if not projects:
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    versions = supabase_request(
        "GET",
        f"project_versions?id=eq.{quote(version_id)}&project_id=eq.{quote(project_id)}&select=id,version_number,change_note,created_at,dataset_snapshot"
    )
    if not versions:
        raise HTTPException(status_code=404, detail="Version not found")

    version = versions[0]

    # Parse snapshot for column metadata preview
    try:
        df = pd.read_csv(StringIO(version["dataset_snapshot"]))
        version["preview_metadata"] = {
            "rows": len(df),
            "cols": len(df.columns),
            "columns": list(df.columns),
        }
        # Remove large snapshot from response — caller uses preview_metadata
        del version["dataset_snapshot"]
    except Exception as e:
        logger.warning(f"Could not parse snapshot for version {version_id}: {e}")
        version["preview_metadata"] = None

    return version


@router.post("/projects/{project_id}/versions/{version_id}/restore")
async def restore_project_version(
    project_id: str,
    version_id: str,
    request: RestoreVersionRequest,
    x_user_id: str = Header(None)
):
    """
    POST /projects/{project_id}/versions/{version_id}/restore
    Restores the project's live dataset to a specific version snapshot.
    Populates the session store and updates project_datasets + dataset_metadata.
    Also writes a new version entry for the restore event.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing calling user credentials")
    validate_uuid(project_id, "Project ID")
    validate_uuid(version_id, "Version ID")
    validate_uuid(x_user_id, "User ID")

    # Verify project ownership
    projects = supabase_request("GET", f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}")
    if not projects:
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    # Fetch the specific version
    versions = supabase_request(
        "GET",
        f"project_versions?id=eq.{quote(version_id)}&project_id=eq.{quote(project_id)}"
    )
    if not versions:
        raise HTTPException(status_code=404, detail="Version not found")

    version = versions[0]

    # Parse the snapshot CSV
    try:
        df = pd.read_csv(StringIO(version["dataset_snapshot"]))
    except Exception as e:
        logger.error(f"Failed to parse version snapshot {version_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse version snapshot: {e}")

    analysis_result = version.get("analysis_result")
    version_number = version["version_number"]

    # Populate the session in-memory
    session_id = request.session_id
    session_data_store[session_id] = df
    analysis_jobs[session_id] = {
        "status": "completed",
        "result": analysis_result,
        "error": None
    }

    # Update project_datasets (the live snapshot used by /load)
    csv_data = version["dataset_snapshot"]
    existing_datasets = supabase_request("GET", f"project_datasets?project_id=eq.{quote(project_id)}")
    if existing_datasets:
        supabase_request(
            "PATCH",
            f"project_datasets?project_id=eq.{quote(project_id)}",
            body={"csv_data": csv_data, "analysis_result": analysis_result}
        )
    else:
        supabase_request(
            "POST",
            "project_datasets",
            body={"project_id": project_id, "csv_data": csv_data, "analysis_result": analysis_result}
        )

    # Update project dataset_metadata to match restored shape
    cols = list(df.columns)
    new_metadata = {
        "rows": len(df),
        "cols": len(cols),
        "columns": cols,
        "fileName": projects[0].get("name", "dataset") + ".csv"
    }
    from datetime import datetime
    supabase_request(
        "PATCH",
        f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}",
        body={
            "dataset_metadata": new_metadata,
            "last_opened_at": datetime.utcnow().isoformat() + "Z"
        }
    )

    # Write a new version entry for the restore event
    try:
        write_project_version(project_id, df, analysis_result, f"Restored from version {version_number}")
    except Exception as e:
        logger.warning(f"Failed to write restore version for project {project_id}: {e}")

    logger.info(f"[{session_id}] Restored project {project_id} to version {version_number}")

    return {
        "project": projects[0],
        "analysis_result": analysis_result,
        "csv_data": csv_data,
        "restored_version": version_number,
    }
