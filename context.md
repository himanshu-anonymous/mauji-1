# Project Context: First PR & Repo Copilot (Browser Extension)

## 1. Executive Summary & Core Directive
We are building **First PR & Repo Copilot**, a Chrome Browser Extension that reviews any GitHub repository or issue in depth by traversing its recursive file tree, checking issue availability, auditing operational/SRE readiness, calculating a **0–100 Repo Score**, and generating a **personalized action plan** based on the reviewer's selected use case.

- **Strict Scope Rule:** We are ONLY building the **First PR & Repo Copilot** browser extension. All other brainstormed ideas (standalone error explainer, lecture flashcards, K8s cluster sabotage) are strictly rejected.
- **Target Audience & Judges:** Hacktoberfest contributors, Cloud Native Pune, MLH, Jarvislabs, Temporal, and RubixKube (Kepler).

---

## 2. The 3 Mandatory Sponsor Integrations

### A. Jarvislabs Token Factory (Core Intelligence Layer)
- **What it is:** Hosted open-model LLM API using an OpenAI-compatible Chat Completions interface.
- **Base URL:** `https://models.jarvislabs.net/v1`
- **Recommended Models:** `deepseek-ai/DeepSeek-V4.1-Flash`, `GLM-5.3-Flash`, or `Qwen-3.8-27B-FP8` (verify exact slug in our Jarvislabs dashboard).
- **What it does in our app:** Consumes the GitHub recursive file structure, README, issue body/comments, Traffic-Light availability status, and Kepler SRE signals to return strict JSON containing the 0–100 score, exact files to inspect, setup commands, and a persona-tailored review.

### B. Temporal (Durable Orchestration Layer)
- **What it is:** Fault-tolerant workflow orchestrator running locally (`temporal server start-dev`, Web UI on `http://localhost:8233`, gRPC on `localhost:7233`).
- **What it does in our app:** Orchestrates our 4-step review pipeline as independent, retryable Temporal Activities:
  1. `fetch_github_context` (GitHub REST API recursive tree + README + issue + comments)
  2. `check_issue_availability` (Plain-code deterministic Traffic Light check)
  3. `run_kepler_sre_audit` (Kepler/RubixKube operational & blast-radius file tree audit)
  4. `generate_jarvislabs_review` (Jarvislabs Token Factory LLM call)
- **Live Demo Moment:** During judging, we trigger a scan, kill `worker.py` (`Ctrl+C`) mid-flight, show `localhost:8233` holding state after Step 2/3, and restart `worker.py` to resume without re-fetching GitHub data.

### C. Kepler by RubixKube (AI SRE & Operational Readiness Layer)
- **CRITICAL WARNING:** Do NOT confuse **Kepler by RubixKube** (the AI SRE IDE / Rubix CLI for operational intelligence and blast-radius analysis) with the unrelated CNCF Kubernetes power consumption exporter.
- **What it does in our app:** Acts as our operational subagent (`run_kepler_sre_audit`). It inspects the repository's operational topology (`Dockerfile`, `.github/workflows`, `helm`/`k8s` manifests, lockfiles, test suites, and optional `rubix --version` CLI bridge) to compute an `sre_readiness_score` (0–100) and highlight deployment/local-setup risks.

---

## 3. Core Features & Personalization Modes

### Feature 1: Deterministic "Traffic Light" Issue Availability Check (Plain Code, No AI)
Beginners waste days working on claimed issues. Before calling the LLM, Activity 2 runs strict deterministic rules:
- 🔴 **RED (`CLOSED` / `ASSIGNED`):** Issue state is closed OR `assignees` array is non-empty.
- 🟡 **AMBER (`LIKELY CLAIMED`):** Unassigned, open, but comments contain claiming phrases (`"working on this"`, `"i'll take this"`, `"can i work on"`, `"submitted a pr"`, `"assign me"`).
- 🟢 **GREEN (`OPEN TO TAKE` / `REPO READY`):** Open, unassigned, and zero claiming comments (or user is scanning the root repo URL).

### Feature 2: Reviewer Use-Case Personalization
The Chrome Extension dropdown lets the user pick their persona, which dynamically changes the scoring weights and LLM output:
1. `first_pr` (**First-Time Contributor / Hacktoberfest Mode**): Explains the issue in 2 plain-English sentences, picks the exact 2–4 files from the repo tree to touch, extracts copy-paste setup commands, writes a 4-step PR guide, and drafts a polite *"Can I be assigned?"* comment.
2. `sre_ops` (**SRE / DevOps Audit — Kepler Mode**): Evaluates `Dockerfile` hygiene, CI/CD workflow coverage, missing environment templates, dependency lockfile risk, and operational blast radius.
3. `maintainer_audit` (**Maintainer / Code Auditor Mode**): Evaluates directory modularity, onboarding friction, documentation gaps, and test coverage across the file tree.

---

## 4. System Architecture & Folder Structure

```text
github-copilot-hack/
├── context.md               # This file (Team & AI Assistant reference)
├── requirements.txt         # fastapi uvicorn temporalio openai requests pydantic
├── backend/
│   ├── worker.py            # Temporal Workflow + all 4 Activities (GitHub, Traffic Light, Kepler, Jarvislabs)
│   └── server.py            # FastAPI server exposing POST http://localhost:8000/analyze
└── extension/
    ├── manifest.json        # Chrome Extension Manifest V3
    ├── popup.html           # Dark-mode GitHub-styled extension UI (420px wide)
    └── popup.js             # Reads active tab URL, calls localhost:8000/analyze, renders cards
```

---

## 5. API Contract (Frontend <-> Backend)

### Request (`POST http://localhost:8000/analyze`)

```json
{
  "github_url": "https://github.com/owner/repo/issues/42",
  "use_case": "first_pr"
}
```

*(Valid `use_case` values: `"first_pr"`, `"sre_ops"`, `"maintainer_audit"`)*

### Response (`200 OK`)

All backend changes MUST preserve this exact JSON structure so `extension/popup.js` never breaks:

```json
{
  "repo": "owner/repo",
  "total_files_scanned": 142,
  "availability": {
    "status": "GREEN",
    "badge": "OPEN TO TAKE",
    "reason": "Unassigned, open, and no claiming comments detected!"
  },
  "kepler_audit": {
    "sre_readiness_score": 85,
    "engine": "Kepler SRE Subagent Active (Static Repo Topology Mode)",
    "signals": {
      "containerized": true,
      "ci_cd_pipelines": true,
      "k8s_manifests": false,
      "test_suite_present": true,
      "dependency_manifest": true
    }
  },
  "review": {
    "overall_repo_score": 84,
    "score_breakdown": {
      "structure_score": 88,
      "beginner_friendliness": 80,
      "sre_infra_score": 85
    },
    "two_sentence_summary": "Plain-English explanation of what this issue or repo does and requires.",
    "files_to_inspect": [
      {
        "path": "src/api/routes.py",
        "why": "Contains the endpoint handler mentioned in the issue description."
      }
    ],
    "setup_commands": [
      "git clone https://github.com/owner/repo.git",
      "pip install -r requirements.txt"
    ],
    "personalized_action_plan": [
      "Fork the repository and create a branch named fix/issue-42.",
      "Update src/api/routes.py to handle empty query parameters.",
      "Run pytest to verify no regressions."
    ],
    "kepler_sre_insight": "CI workflows and Dockerfile are present, but no Kubernetes manifests were found; local Docker testing is recommended before opening a PR.",
    "ready_to_post_comment": "Hi! I noticed this issue is unassigned. I've reviewed src/api/routes.py and would love to submit a PR for this—could you please assign it to me?"
  }
}
```

---

## 6. Environment Variables & Setup Checklist

Every backend teammate must export these before running `worker.py`:

```bash
# Required: Prevents GitHub's 60 req/hr shared-Wi-Fi IP rate limit!
export GITHUB_TOKEN="ghp_xxx"

# Required: Jarvislabs Token Factory API Key
export JARVISLABS_API_KEY="jl_xxx"

# Optional override (check Jarvislabs console for exact model ID)
export JARVISLABS_MODEL="deepseek-ai/DeepSeek-V4.1-Flash"
```

---

## 7. Team Roles & Responsibilities

1. **Role 1 — Chrome Extension & UI (`extension/*`):**
* Own `manifest.json`, `popup.html`, and `popup.js`.
* Polish the Traffic Light badge (`GREEN`/`AMBER`/`RED`), the 3-column score card, copy-to-clipboard button for the GitHub comment, and loading spinner.


2. **Role 2 — GitHub API & Traffic Light Rules (`fetch_github_context` & `check_issue_availability`):**
* Generate the Personal Access Token (`GITHUB_TOKEN`).
* Handle edge cases: URLs with trailing slashes, `/pull/` links, repos with `master` vs `main`, and missing READMEs.


3. **Role 3 — Prompt Engineering & Kepler SRE Audit (`generate_jarvislabs_review` & `run_kepler_sre_audit`):**
* Verify the Jarvislabs Token Factory model slug and test the prompt against 5 real GitHub issues (at least 1 Red, 1 Amber, 1 Green).
* Ensure the LLM always returns strict, parseable JSON without markdown wrappers.


4. **Role 4 — Temporal & FastAPI Integration (`GitHubCopilotWorkflow` & `server.py`):**
* Run `temporal server start-dev` and verify the workflow executes cleanly in `http://localhost:8233`.
* Practice the live worker crash-and-resume demo (`Ctrl+C` -> restart `worker.py`).



---

## 8. 3-Hour Hackathon Execution Timeline

* **0:00 – 0:20 | Setup & Keys:** Lock in roles, generate `GITHUB_TOKEN`, verify `JARVISLABS_API_KEY` with a 5-line test script, and install `temporal` CLI.
* **0:20 – 1:15 | End-to-End Ugly Pipe:** Get `popup.js` -> `server.py` -> `worker.py` -> GitHub + Jarvislabs returning raw JSON into the extension popup.
* **1:15 – 1:45 | Traffic Light + Kepler Audit + Persona Tuning:** Perfect the Red/Amber/Green detection, Kepler SRE score signals, and UI cards.
* **1:45 – 2:15 | Temporal Crash Demo Rehearsal:** Test killing `worker.py` mid-request and watching Temporal recover on `localhost:8233`.
* **2:15 – 2:30 | Feature Freeze & Backup Video:** Stop coding. Record a 60-second screen recording of a full scan in case venue Wi-Fi drops during judging.
* **2:30 – 3:00 | Pitch Rehearsal:** Practice the 60-second pitch twice with all teammates knowing their cue.

---

## 9. The 60-Second Winning Pitch Script

> "Hacktoberfest brings thousands of first-time contributors to GitHub, but most give up before their first pull request. Issues are written for insiders, and half the 'good first issues' are already quietly claimed in the comments.
> We built **First PR & Repo Copilot**—a Chrome Extension powered by **Jarvislabs Token Factory**, **Temporal**, and **Kepler by RubixKube**.
> Open any GitHub repo or issue, pick your role—First-Time Contributor, SRE, or Maintainer—and click Scan. First, plain-code rules run a **Traffic Light check** to tell you in one second if the issue is truly open or already claimed. Second, our **Kepler SRE layer** audits the repository's file tree for Dockerfiles, CI pipelines, and operational readiness. Third, **Jarvislabs Token Factory** scores the codebase out of 100, pinpoints the exact files to edit, and writes a beginner-friendly PR plan and assignment comment.
> Best of all, every step runs as a **Temporal workflow**—if I kill our worker process mid-scan right now [kill worker], Temporal preserves the GitHub and Kepler state and resumes automatically the second the worker restarts [restart worker]."
