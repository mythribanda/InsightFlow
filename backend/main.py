"""
FastAPI server for InsightFlow modeling pipeline.
Provides endpoints for: target suitability, feature recommendations, 
model training, and SHAP explainability.
"""

import os
import sys
import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Windows thread limit setup
if sys.platform == "win32":
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
    os.environ["NUMEXPR_NUM_THREADS"] = "1"

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import shared state/cleanup task
from state import cleanup_sessions_task

# Import routers
from routers import (
    analyze,
    model,
    shap,
    visualize,
    chat,
    clustering,
    profile,
    session,
)

# FastAPI app
app = FastAPI(
    title="InsightFlow - Modeling API",
    description="ML modeling pipeline with leakage detection, feature recommendations, and SHAP explainability",
    version="1.0.0"
)

# CORS
cors_origins_str = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logger.error(f"Validation error on {request.url.path}: {exc_str}")
    logger.error(f"Request body: {await request.body()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(await request.body())}
    )

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_sessions_task())

# Include all routers
app.include_router(analyze.router)
app.include_router(model.router)
app.include_router(shap.router)
app.include_router(visualize.router)
app.include_router(chat.router)
app.include_router(clustering.router)
app.include_router(profile.router)
app.include_router(session.router)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "InsightFlow Modeling API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
