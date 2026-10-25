import uuid
import os
from contextlib import asynccontextmanager
from typing import Literal, Optional, Any
from fastapi import FastAPI, HTTPException
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
    description="FastAPI gateway orchestrating GitHub analysis, Traffic Light checks, Kepler SRE audits, and Jarvislabs LLM reviews via Temporal.",
    version="1.0.0",
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

@app.get("/health")
async def health_check():
    temporal_status = "connected" if temporal_client is not None else "direct_mode (ready)"
    return {
        "status": "ok",
        "orchestration_mode": temporal_status,
        "task_queue": TASK_QUEUE_NAME
    }

@app.post("/analyze")
async def analyze_repo_or_issue(request: AnalyzeRequest):
    global temporal_client

    # 1. If Temporal is available and connected, run via Temporal Workflow
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

    # 2. Resilient Direct Execution Pipeline (Runs all 5 activities cleanly)
    try:
        # Step 1: Fetch GitHub context
        github_context = await fetch_github_context(request.github_url)

        # Step 2: Traffic Light availability
        availability = await check_issue_availability(github_context)

        # Step 3: GitHub Actions triage (from LondheShubham153)
        actions_triage = await triage_github_actions(github_context)

        # Step 4: Kepler SRE operational audit
        kepler_audit = await run_kepler_sre_audit({
            "github_context": github_context,
            "actions_triage": actions_triage
        })

        # Step 5: Jarvislabs / Gemma AI Review
        review = await generate_jarvislabs_review({
            "github_context": github_context,
            "availability": availability,
            "kepler_audit": kepler_audit,
            "actions_triage": actions_triage,
            "use_case": request.use_case
        })

        return {
            "repo": github_context.get("repo"),
            "total_files_scanned": github_context.get("total_files", 0),
            "availability": availability,
            "kepler_audit": kepler_audit,
            "review": review
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis pipeline error: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.server:app", host="0.0.0.0", port=8000, reload=True)
