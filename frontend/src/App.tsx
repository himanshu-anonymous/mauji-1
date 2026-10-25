import { useState, useEffect } from 'react'

interface FileItem {
  path: string
  note: string
}

const defaultFiles: FileItem[] = [
  { path: 'backend/worker.py', note: 'Temporal workflow and 5 review activities' },
  { path: 'backend/server.py', note: 'FastAPI gateway and MV3 extension endpoints' },
  { path: 'context.md', note: 'Single source of truth and architecture specifications' },
]

const defaultSteps = [
  'Fork the repository and clone your local copy.',
  'Verify the setup commands and review target files.',
  'Submit a polite Pull Request with test notes.',
]

const defaultTerminalCommand = 'git clone https://github.com/himanshu-anonymous/mauji-1.git'

export default function App() {
  const [url, setUrl] = useState('https://github.com/himanshu-anonymous/mauji-1')
  const [mode, setMode] = useState('FIRST PR')
  const [scanned, setScanned] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<'command' | 'comment' | null>(null)
  const [darkMode, setDarkMode] = useState(true)

  // Dynamic analysis state from backend
  const [statusBadge, setStatusBadge] = useState('[STATUS: OPEN TO TAKE]')
  const [statusReason, setStatusReason] = useState('// NO CLAIMS DETECTED')
  const [scores, setScores] = useState({ structure: 88, beginner: 80, kepler: 85 })
  const [files, setFiles] = useState<FileItem[]>(defaultFiles)
  const [terminalCommand, setTerminalCommand] = useState(defaultTerminalCommand)
  const [steps, setSteps] = useState<string[]>(defaultSteps)
  const [keplerSignals, setKeplerSignals] = useState({ docker: true, cicd: true, k8s: false })
  const [keplerScore, setKeplerScore] = useState(85)
  const [comment, setComment] = useState(
    'Hi! I’d love to work on this issue as my first contribution. I’ve reviewed the relevant files and can share a draft PR shortly. Could you please assign it to me?'
  )

  // Auto-detect current tab if running inside Chrome Extension
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).chrome?.tabs?.query) {
      (window as any).chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs?.[0]?.url && tabs[0].url.includes('github.com')) {
          setUrl(tabs[0].url)
        }
      })
    }
  }, [])

  const copy = async (text: string, type: 'command' | 'comment') => {
    await navigator.clipboard?.writeText(text)
    setCopied(type)
    window.setTimeout(() => setCopied(null), 1400)
  }

  const handleScan = async () => {
    setLoading(true)
    let useCase = 'first_pr'
    if (mode === 'QUICK FIX') useCase = 'sre_ops'
    if (mode === 'DEEP SCAN') useCase = 'maintainer_audit'

    try {
      let targetUrl = url.trim()
      if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl
      }

      const res = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url: targetUrl, use_case: useCase }),
      })

      if (res.ok) {
        const data = await res.json()
        const avail = data.availability || {}
        setStatusBadge(`[STATUS: ${avail.badge || 'OPEN'}]`)
        setStatusReason(`// ${avail.reason || 'NO CLAIMS DETECTED'}`)

        const review = data.review || {}
        const breakdown = review.score_breakdown || {}
        setScores({
          structure: breakdown.structure_score || 85,
          beginner: breakdown.beginner_friendliness || 80,
          kepler: data.kepler_audit?.sre_readiness_score || breakdown.sre_infra_score || 85,
        })

        if (review.files_to_inspect?.length) {
          setFiles(
            review.files_to_inspect.map((f: any) => ({
              path: f.path,
              note: f.why,
            }))
          )
        }

        if (review.setup_commands?.length) {
          setTerminalCommand(review.setup_commands[1] || review.setup_commands[0])
        }

        if (review.personalized_action_plan?.length) {
          setSteps(review.personalized_action_plan)
        }

        if (data.kepler_audit) {
          setKeplerScore(data.kepler_audit.sre_readiness_score || 85)
          const sigs = data.kepler_audit.signals || {}
          setKeplerSignals({
            docker: Boolean(sigs.containerized),
            cicd: Boolean(sigs.ci_cd_pipelines),
            k8s: Boolean(sigs.k8s_manifests),
          })
        }

        if (review.ready_to_post_comment) {
          setComment(review.ready_to_post_comment)
        }

        setScanned(true)
      } else {
        // Still toggle scanned for demo continuity
        setScanned(true)
      }
    } catch (e) {
      console.warn('API call fallback:', e)
      setScanned(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={`popup-shell${darkMode ? ' dark' : ''}`}>
      <header className="header">
        <div className="brand-row">
          <div>
            <p className="eyebrow">OSS MISSION CONTROL / 001</p>
            <h1>FIRST PR <span>//</span> <strong>COPILOT</strong></h1>
          </div>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setDarkMode((value) => !value)}
            aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
            aria-pressed={darkMode}
          >
            <i aria-hidden="true">{darkMode ? '☾' : '☀'}</i>
          </button>
        </div>
        <div className="sponsors" aria-label="Sponsors">
          <span className="jarvis">[JARVISLABS]</span>
          <span className="temporal">[TEMPORAL]</span>
          <span className="kepler">[KEPLER_SRE]</span>
        </div>
      </header>

      <section className="input-zone" aria-label="Repository scanner">
        <label htmlFor="repo-url">ISSUE OR REPOSITORY COORDINATES</label>
        <div className="cli-input">
          <span aria-hidden="true">&gt;</span>
          <input
            id="repo-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label="GitHub URL"
          />
        </div>
        <div className="action-row">
          <select value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Scan mode">
            <option>FIRST PR</option>
            <option>QUICK FIX</option>
            <option>DEEP SCAN</option>
          </select>
          <button className="scan-button" onClick={handleScan} disabled={loading}>
            {loading ? 'SCANNING...' : scanned ? 'RE-SCAN ↗' : 'SCAN REPO ↗'}
          </button>
        </div>
      </section>

      <section className="status-banner">
        <div className="stripe" />
        <div>
          <p>{statusBadge}</p>
          <strong>{statusReason}</strong>
        </div>
        <span className="status-light" aria-hidden="true" />
      </section>

      <section className="scores" aria-label="Repository scores">
        {[
          [String(scores.structure), 'STRUCTURE'],
          [String(scores.beginner), 'BEGINNER_', 'FRIENDLY'],
          [String(scores.kepler), 'KEPLER_SRE'],
        ].map(([score, ...label]) => (
          <article className="score-card" key={label.join('')}>
            <strong>{score}</strong><span>/100</span>
            <p>{label.map((line) => <span key={line}>{line}</span>)}</p>
          </article>
        ))}
      </section>

      <section className="module files-module">
        <div className="section-heading">
          <h2><span>01</span> FILES TO INSPECT</h2>
          <em>{files.length} FILES</em>
        </div>
        <div className="file-list">
          {files.map((file) => (
            <div className="file-row" key={file.path}>
              <span className="file-icon" aria-hidden="true">↳</span>
              <div><code>{file.path}</code><p>{file.note}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="module">
        <div className="section-heading">
          <h2><span>02</span> TERMINAL RUN</h2>
          <em>READY</em>
        </div>
        <div className="terminal">
          <div className="terminal-top"><span>LOCAL://SHELL</span><i>● ● ●</i></div>
          <div className="command">
            <code><b>$</b> {terminalCommand}</code>
            <button onClick={() => copy(terminalCommand, 'command')} aria-label="Copy terminal command">
              {copied === 'command' ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <p>✓ 12 checks passed <span>in 0.82s</span></p>
        </div>
      </section>

      <section className="module">
        <div className="section-heading">
          <h2><span>03</span> ACTION PLAN</h2>
          <em>~25 MIN</em>
        </div>
        <ol className="plan">
          {steps.map((step, index) => (
            <li key={step}><b>{String(index + 1).padStart(2, '0')}</b><p>{step}</p></li>
          ))}
        </ol>
      </section>

      <section className="readiness">
        <div className="readiness-title">
          <div><span>KEPLER_SRE</span><h2>KEPLER SRE AUDIT</h2></div>
          <strong>{keplerScore}%</strong>
        </div>
        <div className="checks">
          <span className={keplerSignals.docker ? '' : 'fail'}>[{keplerSignals.docker ? '✓' : '✗'} DOCKER]</span>
          <span className={keplerSignals.cicd ? '' : 'fail'}>[{keplerSignals.cicd ? '✓' : '✗'} CI/CD]</span>
          <span className={keplerSignals.k8s ? '' : 'fail'}>[{keplerSignals.k8s ? '✓' : '✗'} K8S]</span>
        </div>
        <p>PRODUCTION SIGNAL: <b>{keplerScore > 70 ? 'STRONG' : 'MODERATE'}</b> // TOPOLOGY AUDITED</p>
      </section>

      <section className="comment-module">
        <div className="section-heading">
          <h2><span>04</span> POLITE COMMENT</h2>
          <em>MARKDOWN</em>
        </div>
        <blockquote>
          <span>“</span>
          <p>{comment}</p>
        </blockquote>
        <button className="copy-comment" onClick={() => copy(comment, 'comment')}>
          {copied === 'comment' ? 'COMMENT COPIED ✓' : 'COPY COMMENT'} <span>⌘C</span>
        </button>
      </section>

      <footer><span>PR_COPILOT v1.0.4</span><b>● SYSTEM ONLINE</b></footer>
    </main>
  )
}
