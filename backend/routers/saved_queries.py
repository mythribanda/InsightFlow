import logging
from typing import Any, List
import uuid
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from src.supabase_client import supabase_request

logger = logging.getLogger(__name__)
router = APIRouter()

class SaveQueryRequest(BaseModel):
    project_id: str
    name: str
    query_text: str

def validate_uuid(val: str, name: str = "ID"):
    if not val:
        raise HTTPException(status_code=400, detail=f"Missing {name}")
    try:
        uuid.UUID(str(val))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {name} format (must be a valid UUID)")

@router.get("/saved-queries/{project_id}")
async def list_saved_queries(project_id: str, x_user_id: str = Header(None)):
    """
    GET /saved-queries/{project_id} -> Lists all saved queries scoped to the project.
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
    
    # 2. Query saved queries
    queries = supabase_request("GET", f"saved_queries?project_id=eq.{quote(project_id)}&order=created_at.desc")
    return queries or []

@router.post("/saved-queries")
async def save_query(request: SaveQueryRequest, x_user_id: str = Header(None)):
    """
    POST /saved-queries -> Inserts or updates a saved query.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    validate_uuid(request.project_id, "Project ID")
    validate_uuid(x_user_id, "User ID")
        
    # Verify user owns the project
    project = supabase_request("GET", f"projects?id=eq.{quote(request.project_id)}&user_id=eq.{quote(x_user_id)}")
    if not project:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this project")

    # Upsert logic: if a saved query with same project_id and name exists, update it. Otherwise insert.
    existing = supabase_request("GET", f"saved_queries?project_id=eq.{quote(request.project_id)}&name=eq.{quote(request.name)}")
    
    query_payload = {
        "project_id": request.project_id,
        "name": request.name,
        "query_text": request.query_text
    }
    
    headers = {"Prefer": "return=representation"}
    if existing:
        query_id = existing[0]["id"]
        validate_uuid(query_id, "Query ID")
        updated = supabase_request("PATCH", f"saved_queries?id=eq.{quote(query_id)}", body=query_payload, headers=headers)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update saved query")
        logger.info(f"Updated saved query {query_id} for project {request.project_id}")
        return updated[0]
    else:
        created = supabase_request("POST", "saved_queries", body=query_payload, headers=headers)
        if not created:
            raise HTTPException(status_code=500, detail="Failed to create saved query")
        logger.info(f"Created saved query for project {request.project_id}")
        return created[0]

@router.delete("/saved-queries/{query_id}")
async def delete_query(query_id: str, x_user_id: str = Header(None)):
    """
    DELETE /saved-queries/{query_id} -> Deletes the saved query.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    validate_uuid(query_id, "Query ID")
    validate_uuid(x_user_id, "User ID")
        
    # Get saved query to check project_id
    query = supabase_request("GET", f"saved_queries?id=eq.{quote(query_id)}")
    if not query:
        raise HTTPException(status_code=404, detail="Saved query not found")
        
    project_id = query[0]["project_id"]
    validate_uuid(project_id, "Project ID")
    
    # Verify user owns the project
    project = supabase_request("GET", f"projects?id=eq.{quote(project_id)}&user_id=eq.{quote(x_user_id)}")
    if not project:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this project")
        
    deleted = supabase_request("DELETE", f"saved_queries?id=eq.{quote(query_id)}")
    logger.info(f"Deleted saved query {query_id}")
    return {"success": True}
