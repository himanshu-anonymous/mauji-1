import uuid
import os
from contextlib import asynccontextmanager
from typing import Literal, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from temporalio.client import Client

TEMPORAL_HOST = os.getenv("TEMPORAL_HOST", "localhost:7233")
TASK_QUEUE_NAME = "github-copilot-task-queue"

class AnalyzeRequest(BaseModel):
    github_url: str
    use_case: Literal["first_pr", "sre_ops", "maintainer_audit"] = "first_pr"

temporal_client: Optional[Client] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global temporal_client
    try:
        print(f"Connecting to Temporal Server at {TEMPORAL_HOST}...")
        temporal_client = await Client.connect(TEMPORAL_HOST)
        print("Connected to Temporal successfully.")
    except Exception as e:
        print(f"Warning: Could not connect to Temporal on startup: {e}")
        print("Ensure 'temporal server start-dev' is running on port 7233.")
        temporal_client = None
    yield
    print("Shutting down API server.")

app = FastAPI(
    title="First PR & Repo Copilot Backend",
    description="FastAPI gateway orchestrating GitHub analysis, Traffic Light checks, Kepler SRE audits, and Jarvislabs LLM reviews via Temporal.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Chrome Extension requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows Chrome extensions and dev origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    temporal_status = "connected" if temporal_client is not None else "disconnected"
    return {
        "status": "ok",
        "temporal": temporal_status,
        "task_queue": TASK_QUEUE_NAME
    }

@app.post("/analyze")
async def analyze_repo_or_issue(request: AnalyzeRequest):
    global temporal_client
    if temporal_client is None:
        try:
            temporal_client = await Client.connect(TEMPORAL_HOST)
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"Temporal Server unreachable at {TEMPORAL_HOST}. Start it via 'temporal server start-dev'. Error: {e}"
            )

    workflow_id = f"copilot-scan-{uuid.uuid4().hex[:10]}"

    try:
        # Import workflow definition name dynamically or execute by name
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
        raise HTTPException(
            status_code=500,
            detail=f"Workflow execution failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
