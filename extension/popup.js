document.addEventListener("DOMContentLoaded", () => {
  const shell = document.getElementById("popup-shell");
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  const urlInput = document.getElementById("repo-url");
  const modeSelect = document.getElementById("scan-mode");
  const scanBtn = document.getElementById("btn-scan");

  const statusBadge = document.getElementById("status-badge");
  const statusReason = document.getElementById("status-reason");
  const statusLight = document.getElementById("status-light");

  const scoreStructure = document.getElementById("score-structure");
  const scoreBeginner = document.getElementById("score-beginner");
  const scoreKepler = document.getElementById("score-kepler");

  const filesCount = document.getElementById("files-count");
  const filesList = document.getElementById("files-list");

  const terminalCmd = document.getElementById("terminal-cmd");
  const btnCopyCmd = document.getElementById("btn-copy-cmd");

  const actionPlan = document.getElementById("action-plan");

  const keplerScorePct = document.getElementById("kepler-score-pct");
  const chkDocker = document.getElementById("chk-docker");
  const chkCicd = document.getElementById("chk-cicd");
  const chkK8s = document.getElementById("chk-k8s");
  const keplerVerdict = document.getElementById("kepler-verdict");

  const commentText = document.getElementById("comment-text");
  const btnCopyComment = document.getElementById("btn-copy-comment");
  const copyCommentLabel = document.getElementById("copy-comment-label");

  let isDark = true;

  // Theme toggle
  themeToggle.addEventListener("click", () => {
    isDark = !isDark;
    if (isDark) {
      shell.classList.add("dark");
      themeIcon.innerText = "☾";
    } else {
      shell.classList.remove("dark");
      themeIcon.innerText = "☀";
    }
  });

  // Auto-detect active GitHub tab
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes("github.com")) {
        urlInput.value = tabs[0].url;
      }
    });
  }

  // Initial populate with default sample files
  renderFiles([
    { path: "backend/worker.py", why: "Temporal workflow and 5 review activities" },
    { path: "backend/server.py", why: "FastAPI gateway and MV3 extension endpoints" },
    { path: "context.md", why: "Single source of truth and architecture specifications" }
  ]);
  renderPlan([
    "Fork the repository and clone your local copy.",
    "Verify setup commands and review target files.",
    "Submit a polite Pull Request with test notes."
  ]);

  // Scan Button Click Handler
  scanBtn.addEventListener("click", async () => {
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) return;
    if (!rawUrl.startsWith("http")) rawUrl = "https://" + rawUrl;

    const useCase = modeSelect.value;
    scanBtn.disabled = true;
    scanBtn.innerText = "SCANNING...";

    try {
      let response;
      try {
        response = await fetch("http://127.0.0.1:8000/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ github_url: rawUrl, use_case: useCase })
        });
      } catch (networkErr) {
        // Fallback to localhost if 127.0.0.1 failed
        response = await fetch("http://localhost:8000/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ github_url: rawUrl, use_case: useCase })
        });
      }

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      applyScanResults(data);
    } catch (err) {
      console.warn("Scan API error:", err);
      statusBadge.innerText = "[STATUS: OFFLINE DEMO]";
      statusReason.innerText = "// BACKEND OFFLINE - SHOWING LOCAL AUDIT";
    } finally {
      scanBtn.disabled = false;
      scanBtn.innerText = "RE-SCAN ↗";
    }
  });

  function applyScanResults(data) {
    // 1. Availability
    const avail = data.availability || {};
    const status = avail.status || "GREEN";
    const badge = avail.badge || "OPEN TO TAKE";
    statusBadge.innerText = `[STATUS: ${badge}]`;
    statusReason.innerText = `// ${avail.reason || "NO CLAIMS DETECTED"}`;

    if (status === "RED") {
      statusLight.style.background = "#ff4d8d";
    } else if (status === "AMBER") {
      statusLight.style.background = "#ffe500";
    } else {
      statusLight.style.background = "#00ff87";
    }

    // 2. Scores
    const review = data.review || {};
    const breakdown = review.score_breakdown || {};
    scoreStructure.innerText = breakdown.structure_score || 85;
    scoreBeginner.innerText = breakdown.beginner_friendliness || 80;
    
    const kepScore = (data.kepler_audit && data.kepler_audit.sre_readiness_score) || breakdown.sre_infra_score || 85;
    scoreKepler.innerText = kepScore;
    keplerScorePct.innerText = `${kepScore}%`;

    // 3. Files
    if (review.files_to_inspect && review.files_to_inspect.length > 0) {
      renderFiles(review.files_to_inspect);
    }

    // 4. Setup Command
    if (review.setup_commands && review.setup_commands.length > 0) {
      const cmd = review.setup_commands[1] || review.setup_commands[0];
      terminalCmd.innerHTML = `<b>$</b> ${escapeHtml(cmd)}`;
    }

    // 5. Action Plan
    if (review.personalized_action_plan && review.personalized_action_plan.length > 0) {
      renderPlan(review.personalized_action_plan);
    }

    // 6. Kepler Signals
    if (data.kepler_audit && data.kepler_audit.signals) {
      const sigs = data.kepler_audit.signals;
      setCheckPill(chkDocker, Boolean(sigs.containerized), "DOCKER");
      setCheckPill(chkCicd, Boolean(sigs.ci_cd_pipelines), "CI/CD");
      setCheckPill(chkK8s, Boolean(sigs.k8s_manifests), "K8S");
      keplerVerdict.innerHTML = `PRODUCTION SIGNAL: <b>${kepScore > 70 ? "STRONG" : "MODERATE"}</b> // TOPOLOGY AUDITED`;
    }

    // 7. Polite Comment
    if (review.ready_to_post_comment) {
      commentText.innerText = review.ready_to_post_comment;
    }
  }

  function renderFiles(files) {
    filesCount.innerText = `${files.length} FILES`;
    filesList.innerHTML = "";
    files.forEach(f => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `
        <span class="file-icon">↳</span>
        <div><code>${escapeHtml(f.path)}</code><p>${escapeHtml(f.why || f.note || "")}</p></div>
      `;
      filesList.appendChild(row);
    });
  }

  function renderPlan(steps) {
    actionPlan.innerHTML = "";
    steps.forEach((step, idx) => {
      const li = document.createElement("li");
      const numStr = String(idx + 1).padStart(2, "0");
      li.innerHTML = `<b>${numStr}</b><p>${escapeHtml(step)}</p>`;
      actionPlan.appendChild(li);
    });
  }

  function setCheckPill(el, passed, label) {
    el.innerText = `[${passed ? "✓" : "✗"} ${label}]`;
    if (passed) {
      el.classList.remove("fail");
    } else {
      el.classList.add("fail");
    }
  }

  // Copy buttons
  btnCopyCmd.addEventListener("click", () => {
    const text = terminalCmd.innerText.replace(/^\$\s*/, "");
    navigator.clipboard.writeText(text).then(() => {
      btnCopyCmd.innerText = "COPIED";
      setTimeout(() => { btnCopyCmd.innerText = "COPY"; }, 1500);
    });
  });

  btnCopyComment.addEventListener("click", () => {
    const text = commentText.innerText;
    navigator.clipboard.writeText(text).then(() => {
      copyCommentLabel.innerText = "COMMENT COPIED ✓";
      setTimeout(() => { copyCommentLabel.innerText = "COPY COMMENT"; }, 1500);
    });
  });

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});
