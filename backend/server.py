import uuid
import os
import time
import asyncio
from contextlib import asynccontextmanager
from typing import Literal, Optional, Any, Dict
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from temporalio.client import Client
except ImportError:
    Client = None

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    if os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

from backend.worker import (
    fetch_github_context,
    check_issue_availability,
    triage_github_actions,
    run_kepler_sre_audit,
    generate_jarvislabs_review
)

TEMPORAL_HOST = os.getenv("TEMPORAL_HOST", "localhost:7233")
TASK_QUEUE_NAME = "github-copilot-task-queue"

# In-memory scan cache & background job storage for MV3 Service Workers
SCAN_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 600  # 10 minutes
ASYNC_JOBS: Dict[str, Dict[str, Any]] = {}

class AnalyzeRequest(BaseModel):
    github_url: str
    use_case: Literal["first_pr", "sre_ops", "maintainer_audit"] = "first_pr"

temporal_client: Optional[Any] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global temporal_client
    if Client is not None:
        try:
            print(f"Connecting to Temporal Server at {TEMPORAL_HOST}...")
            temporal_client = await Client.connect(TEMPORAL_HOST)
            print("Connected to Temporal successfully.")
        except Exception as e:
            print(f"Info: Temporal server not found at {TEMPORAL_HOST} ({e}).")
            print("Direct execution engine will handle requests until 'temporal server start-dev' is active.")
            temporal_client = None
    else:
        print("Info: 'temporalio' package not installed in environment. Running in Direct Execution Engine mode.")
        temporal_client = None
    yield
    print("Shutting down API server.")

app = FastAPI(
    title="First PR & Repo Copilot Backend",
    description="FastAPI gateway supporting Chrome Extension MV3 workflows (Popups, Background Service Workers, Content Scripts, and Side Panels).",
    version="1.1.0",
    lifespan=lifespan
)

# Enable CORS for Chrome Extension requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def _execute_analysis(github_url: str, use_case: str) -> Dict[str, Any]:
    """Core analysis orchestrator with caching and multi-provider fallback."""
    cache_key = f"{github_url}::{use_case}"
    cached = SCAN_CACHE.get(cache_key)
    if cached and (time.time() - cached["cached_at"]) < CACHE_TTL_SECONDS:
        return cached["data"]

    # 1. Fetch GitHub context
    github_context = await fetch_github_context(github_url)

    # 2. Traffic Light availability
    availability = await check_issue_availability(github_context)

    # 3. GitHub Actions triage (from LondheShubham153)
    actions_triage = await triage_github_actions(github_context)

    # 4. Kepler SRE operational audit
    kepler_audit = await run_kepler_sre_audit({
        "github_context": github_context,
        "actions_triage": actions_triage
    })

    # 5. Jarvislabs / Gemma AI Review
    review = await generate_jarvislabs_review({
        "github_context": github_context,
        "availability": availability,
        "kepler_audit": kepler_audit,
        "actions_triage": actions_triage,
        "use_case": use_case
    })

    payload = {
        "repo": github_context.get("repo"),
        "total_files_scanned": github_context.get("total_files", 0),
        "availability": availability,
        "kepler_audit": kepler_audit,
        "review": review
    }

    SCAN_CACHE[cache_key] = {"data": payload, "cached_at": time.time()}
    return payload


async def _run_background_scan(job_id: str, github_url: str, use_case: str):
    """Background task runner for MV3 Service Worker polling."""
    try:
        result = await _execute_analysis(github_url, use_case)
        ASYNC_JOBS[job_id]["status"] = "COMPLETED"
        ASYNC_JOBS[job_id]["data"] = result
    except Exception as e:
        ASYNC_JOBS[job_id]["status"] = "FAILED"
        ASYNC_JOBS[job_id]["error"] = str(e)


# ==========================================
# REST API Endpoints for Chrome Extension MV3
# ==========================================

@app.get("/health")
async def health_check():
    temporal_status = "connected" if temporal_client is not None else "direct_mode (ready)"
    return {
        "status": "ok",
        "orchestration_mode": temporal_status,
        "task_queue": TASK_QUEUE_NAME,
        "active_cache_entries": len(SCAN_CACHE)
    }

@app.get("/quick-check")
async def quick_check(url: str = Query(..., description="GitHub repository or issue URL")):
    """
    Sub-150ms deterministic check designed for Chrome Content Scripts (content.js).
    Injects green/amber/red status badges directly onto GitHub issue pages without LLM overhead.
    """
    try:
        github_context = await fetch_github_context(url)
        availability = await check_issue_availability(github_context)
        return {
            "repo": github_context.get("repo"),
            "availability": availability
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/analyze")
async def analyze_repo_or_issue(request: AnalyzeRequest):
    """
    Synchronous analysis endpoint designed for extension popups (popup.js).
    Returns complete API contract including Traffic Light, Kepler SRE, and AI action plan.
    """
    global temporal_client

    if temporal_client is None and Client is not None:
        try:
            temporal_client = await Client.connect(TEMPORAL_HOST)
        except Exception:
            temporal_client = None

    if temporal_client is not None:
        workflow_id = f"copilot-scan-{uuid.uuid4().hex[:10]}"
        try:
            result = await temporal_client.execute_workflow(
                "GitHubCopilotWorkflow",
                {
                    "github_url": request.github_url,
                    "use_case": request.use_case
                },
                id=workflow_id,
                task_queue=TASK_QUEUE_NAME
            )
            return result
        except Exception as e:
            print(f"Temporal execution error: {e}. Falling back to direct execution.")

    try:
        return await _execute_analysis(request.github_url, request.use_case)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis pipeline error: {str(e)}")

@app.post("/workflow/start")
async def start_async_workflow(request: AnalyzeRequest):
    """
    Asynchronous initiation endpoint for Chrome Background Service Workers (background.js).
    Prevents scan aborts when users dismiss the popup UI mid-request.
    """
    job_id = f"scan-{uuid.uuid4().hex[:10]}"
    ASYNC_JOBS[job_id] = {
        "workflow_id": job_id,
        "status": "RUNNING",
        "github_url": request.github_url,
        "use_case": request.use_case,
        "data": None,
        "started_at": time.time()
    }
    asyncio.create_task(_run_background_scan(job_id, request.github_url, request.use_case))
    return {
        "workflow_id": job_id,
        "status": "RUNNING",
        "poll_url": f"/workflow/status/{job_id}"
    }

@app.get("/workflow/status/{workflow_id}")
async def get_workflow_status(workflow_id: str):
    """
    Polling endpoint for Chrome Service Workers to check background scan progress.
    """
    job = ASYNC_JOBS.get(workflow_id)
    if not job:
        raise HTTPException(status_code=404, detail="Workflow ID not found")
    return job

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
