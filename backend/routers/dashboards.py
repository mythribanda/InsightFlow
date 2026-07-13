import logging
from typing import Any, List
import uuid
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from src.supabase_client import supabase_request

logger = logging.getLogger(__name__)
router = APIRouter()

class SaveDashboardRequest(BaseModel):
    project_id: str
    name: str
    layout_json: Any

def validate_uuid(val: str, name: str = "ID"):
    if not val:
        raise HTTPException(status_code=400, detail=f"Missing {name}")
    try:
        uuid.UUID(str(val))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {name} format (must be a valid UUID)")

@router.get("/dashboards/{project_id}")
async def list_dashboards(project_id: str, x_user_id: str = Header(None)):
    """
    GET /dashboards/{project_id} -> Lists all dashboards scoped to the project.
    Verifies user has access by checking project ownership.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    validate_uuid(project_id, "Project ID")
    validate_uuid(x_user_id, "User ID")
    
    # 1. Verify user owns the project
    project = supabase_request("GET", f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}")
    if not project:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this project")
    
    # 2. Query dashboards
    dashboards = supabase_request("GET", f"dashboards?project_id=eq.{quote(project_id)}&order=created_at.desc")
    return dashboards or []

@router.post("/dashboards")
async def save_dashboard(request: SaveDashboardRequest, x_user_id: str = Header(None)):
    """
    POST /dashboards -> Inserts or updates a dashboard.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    validate_uuid(request.project_id, "Project ID")
    validate_uuid(x_user_id, "User ID")
        
    # Verify user owns the project
    project = supabase_request("GET", f"projects?id=eq.{quote(request.project_id)}&user_id=eq.{quote(x_user_id)}")
    if not project:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this project")

    # Upsert logic: if a dashboard with same project_id and name exists, update it. Otherwise insert.
    existing = supabase_request("GET", f"dashboards?project_id=eq.{quote(request.project_id)}&name=eq.{quote(request.name)}")
    
    dashboard_payload = {
        "project_id": request.project_id,
        "name": request.name,
        "layout_json": request.layout_json
    }
    
    headers = {"Prefer": "return=representation"}
    if existing:
        dashboard_id = existing[0]["id"]
        validate_uuid(dashboard_id, "Dashboard ID")
        updated = supabase_request("PATCH", f"dashboards?id=eq.{quote(dashboard_id)}", body=dashboard_payload, headers=headers)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update dashboard")
        logger.info(f"Updated dashboard {dashboard_id} for project {request.project_id}")
        return updated[0]
    else:
        created = supabase_request("POST", "dashboards", body=dashboard_payload, headers=headers)
        if not created:
            raise HTTPException(status_code=500, detail="Failed to create dashboard")
        logger.info(f"Created dashboard for project {request.project_id}")
        return created[0]

@router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(dashboard_id: str, x_user_id: str = Header(None)):
    """
    DELETE /dashboards/{dashboard_id} -> Deletes the dashboard.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    validate_uuid(dashboard_id, "Dashboard ID")
    validate_uuid(x_user_id, "User ID")
        
    # Get dashboard to check project_id
    dashboard = supabase_request("GET", f"dashboards?id=eq.{quote(dashboard_id)}")
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
        
    project_id = dashboard[0]["project_id"]
    validate_uuid(project_id, "Project ID")
    
    # Verify user owns the project
    project = supabase_request("GET", f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}")
    if not project:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this project")
        
    deleted = supabase_request("DELETE", f"dashboards?id=eq.{quote(dashboard_id)}")
    logger.info(f"Deleted dashboard {dashboard_id}")
    return {"success": True}
