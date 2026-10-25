document.addEventListener("DOMContentLoaded", () => {
  const urlInput = document.getElementById("github-url");
  const useCaseSelect = document.getElementById("use-case");
  const scanBtn = document.getElementById("btn-scan");
  const spinner = document.getElementById("spinner");
  const btnText = document.getElementById("btn-text");
  const errorContainer = document.getElementById("error-container");
  const resultsDiv = document.getElementById("results");

  // Auto-populate active GitHub tab URL if available
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes("github.com")) {
        urlInput.value = tabs[0].url;
      } else {
        urlInput.value = "https://github.com/himanshu-anonymous/mauji-1";
      }
    });
  } else {
    urlInput.value = "https://github.com/himanshu-anonymous/mauji-1";
  }

  // Scan Button Handler
  scanBtn.addEventListener("click", async () => {
    const githubUrl = urlInput.value.trim();
    const useCase = useCaseSelect.value;

    if (!githubUrl) {
      showError("Please enter a valid GitHub repository or issue URL.");
      return;
    }

    setLoading(true);
    clearError();
    resultsDiv.style.display = "none";

    try {
      const response = await fetch("http://localhost:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: githubUrl, use_case: useCase })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      renderResults(data);
    } catch (err) {
      showError(err.message || "Failed to connect to backend at http://localhost:8000. Is the server running?");
    } finally {
      setLoading(false);
    }
  });

  // Copy Comment Handler
  document.getElementById("btn-copy-comment").addEventListener("click", () => {
    const comment = document.getElementById("comment-text").innerText;
    navigator.clipboard.writeText(comment).then(() => {
      const copyBtn = document.getElementById("btn-copy-comment");
      copyBtn.innerText = "Copied!";
      setTimeout(() => { copyBtn.innerText = "Copy"; }, 2000);
    });
  });

  function renderResults(data) {
    // 1. Availability Traffic Light
    const avail = data.availability || { status: "GREEN", badge: "OPEN", reason: "Ready" };
    const availBadge = document.getElementById("avail-badge");
    availBadge.className = `traffic-pill traffic-${avail.status}`;
    availBadge.innerText = `${avail.status === "GREEN" ? "● " : avail.status === "AMBER" ? "▲ " : "■ "}${avail.badge}`;
    document.getElementById("avail-reason").innerText = avail.reason;

    // 2. Scores
    const review = data.review || {};
    const scores = review.score_breakdown || {};
    document.getElementById("score-overall").innerText = review.overall_repo_score || "--";
    document.getElementById("score-structure").innerText = scores.structure_score || "--";
    document.getElementById("score-sre").innerText = (data.kepler_audit && data.kepler_audit.sre_readiness_score) || scores.sre_infra_score || "--";

    // 3. Summary
    document.getElementById("summary-text").innerText = review.two_sentence_summary || "Scan complete.";

    // 4. Kepler SRE & CI Signals
    const kepler = data.kepler_audit || {};
    document.getElementById("kepler-insight").innerText = review.kepler_sre_insight || kepler.engine || "";
    
    const pillsContainer = document.getElementById("signal-pills");
    pillsContainer.innerHTML = "";
    const sigs = kepler.signals || {};
    const signalLabels = [
      { key: "containerized", label: "Docker/Container" },
      { key: "ci_cd_pipelines", label: "CI/CD Workflows" },
      { key: "k8s_manifests", label: "Kubernetes/Helm" },
      { key: "test_suite_present", label: "Tests Suite" },
      { key: "dependency_manifest", label: "Lockfiles" },
      { key: "ci_runs_passing", label: "CI Runs Passing" }
    ];

    signalLabels.forEach(s => {
      const span = document.createElement("span");
      const active = Boolean(sigs[s.key]);
      span.className = `sig-pill ${active ? "active" : ""}`;
      span.innerText = `${active ? "✓" : "✗"} ${s.label}`;
      pillsContainer.appendChild(span);
    });

    // 5. Files to Inspect
    const filesContainer = document.getElementById("files-list");
    filesContainer.innerHTML = "";
    (review.files_to_inspect || []).forEach(f => {
      const item = document.createElement("div");
      item.className = "file-item";
      item.innerHTML = `<div class="file-path">${escapeHtml(f.path)}</div><div style="color: #8b949e; font-size: 11px; margin-top: 2px;">${escapeHtml(f.why)}</div>`;
      filesContainer.appendChild(item);
    });

    // 6. Setup Commands
    const setupContainer = document.getElementById("setup-commands");
    setupContainer.innerHTML = "";
    (review.setup_commands || []).forEach(cmd => {
      const pre = document.createElement("div");
      pre.className = "code-block";
      pre.innerText = cmd;
      setupContainer.appendChild(pre);
    });

    // 7. Personalized Action Plan
    const actionPlanList = document.getElementById("action-plan");
    actionPlanList.innerHTML = "";
    (review.personalized_action_plan || []).forEach(step => {
      const li = document.createElement("li");
      li.innerText = step;
      actionPlanList.appendChild(li);
    });

    // 8. Ready to Post Comment
    document.getElementById("comment-text").innerText = review.ready_to_post_comment || "Ready to contribute!";

    resultsDiv.style.display = "block";
  }

  function setLoading(loading) {
    scanBtn.disabled = loading;
    if (loading) {
      spinner.style.display = "inline-block";
      btnText.innerText = "Analyzing via Temporal...";
    } else {
      spinner.style.display = "none";
      btnText.innerText = "Scan Codebase";
    }
  }

  function showError(msg) {
    errorContainer.innerText = msg;
    errorContainer.style.display = "block";
  }

  function clearError() {
    errorContainer.style.display = "none";
    errorContainer.innerText = "";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});
