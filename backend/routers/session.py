import logging
from fastapi import APIRouter, Header

from state import (
    session_data_store,
    analysis_jobs,
    verify_session_owner,
    model_store,
    model_results_store,
    anomaly_results_store,
    cluster_labels_store,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.delete("/session/{session_id}")
async def end_session(session_id: str, x_user_id: str = Header(None)):
    """
    Explicitly end a session to free memory immediately.
    """
    verify_session_owner(session_id, x_user_id)
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

    if session_id in model_store:
        before = len(model_store)
        model_store.pop(session_id, None)
        after = len(model_store)
        evicted.append("model_store")
        logger.info(f"Explicit end_session evicted {session_id} from model_store. Size before: {before}, after: {after}")

    if session_id in model_results_store:
        before = len(model_results_store)
        model_results_store.pop(session_id, None)
        after = len(model_results_store)
        evicted.append("model_results_store")
        logger.info(f"Explicit end_session evicted {session_id} from model_results_store. Size before: {before}, after: {after}")

    if session_id in anomaly_results_store:
        before = len(anomaly_results_store)
        anomaly_results_store.pop(session_id, None)
        after = len(anomaly_results_store)
        evicted.append("anomaly_results_store")
        logger.info(f"Explicit end_session evicted {session_id} from anomaly_results_store. Size before: {before}, after: {after}")

    if session_id in cluster_labels_store:
        before = len(cluster_labels_store)
        cluster_labels_store.pop(session_id, None)
        after = len(cluster_labels_store)
        evicted.append("cluster_labels_store")
        logger.info(f"Explicit end_session evicted {session_id} from cluster_labels_store. Size before: {before}, after: {after}")
        
    if evicted:
        return {"status": "success", "message": f"Evicted from {', '.join(evicted)}"}
    return {"status": "not_found", "message": "Session not found or already evicted"}
