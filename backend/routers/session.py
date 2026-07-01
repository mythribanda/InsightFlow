import logging
from fastapi import APIRouter

from state import session_data_store, analysis_jobs

logger = logging.getLogger(__name__)
router = APIRouter()


@router.delete("/session/{session_id}")
async def end_session(session_id: str):
    """
    Explicitly end a session to free memory immediately.
    """
    evicted = []
    if session_id in session_data_store:
        before = len(session_data_store)
        session_data_store.pop(session_id, None)
        after = len(session_data_store)
        evicted.append("session_data_store")
        logger.info(f"Explicit end_session evicted {session_id} from session_data_store. Size before: {before}, after: {after}")
        
    if session_id in analysis_jobs:
        before = len(analysis_jobs)
        analysis_jobs.pop(session_id, None)
        after = len(analysis_jobs)
        evicted.append("analysis_jobs")
        logger.info(f"Explicit end_session evicted {session_id} from analysis_jobs. Size before: {before}, after: {after}")
        
    if evicted:
        return {"status": "success", "message": f"Evicted from {', '.join(evicted)}"}
    return {"status": "not_found", "message": "Session not found or already evicted"}
