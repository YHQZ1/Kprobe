import { useState } from "react";

const CORRECT_USER = "admin";
const CORRECT_PASS = "admin";

interface LoginProps {
  onAuth: () => void;
}

export default function Login({ onAuth }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Simulate a brief auth delay — feels real
    setTimeout(() => {
      if (username === CORRECT_USER && password === CORRECT_PASS) {
        onAuth();
      } else {
        setError("Invalid credentials.");
        setLoading(false);
      }
    }, 420);
  }

  return (
    <div style={styles.root}>
      {/* Left panel — branding */}
      <div style={styles.left}>
        <div style={styles.leftInner}>
          <div style={styles.wordmark}>
            <span style={styles.wordmarkK}>k</span>
            <span style={styles.wordmarkProbe}>probe</span>
          </div>
          <p style={styles.leftTagline}>
            Kernel-level observability
            <br />
            for financial systems.
          </p>
          <div style={styles.leftMeta}>
            <div style={styles.metaRow}>
              <span style={styles.metaDot} />
              <span style={styles.metaText}>eBPF · zero instrumentation</span>
            </div>
            <div style={styles.metaRow}>
              <span style={styles.metaDot} />
              <span style={styles.metaText}>
                causal graphs · nanosecond precision
              </span>
            </div>
            <div style={styles.metaRow}>
              <span style={styles.metaDot} />
              <span style={styles.metaText}>deterministic incident replay</span>
            </div>
          </div>
        </div>

        {/* Decorative kernel event stream */}
        <div style={styles.streamDecor}>
          <div style={styles.streamLabel}>
            <span style={styles.streamPulse} />
            live · kernel event stream
          </div>
          {MOCK_EVENTS.map((ev, i) => (
            <div
              key={i}
              style={{
                ...styles.streamRow,
                ...(ev.highlight ? styles.streamRowHighlight : {}),
                ...(ev.muted ? styles.streamRowMuted : {}),
              }}
            >
              <span style={styles.streamTs}>{ev.ts}</span>
              <span
                style={{
                  ...styles.streamType,
                  ...(ev.highlight ? styles.streamTypeAccent : {}),
                }}
              >
                {ev.type}
              </span>
              <span style={styles.streamDetail}>{ev.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={styles.right}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardTitle}>Sign in</div>
            <div style={styles.cardSub}>Access the kprobe console</div>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  ...styles.input,
                  ...(error ? styles.inputError : {}),
                }}
                placeholder="admin"
                spellCheck={false}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  ...styles.input,
                  ...(error ? styles.inputError : {}),
                }}
                placeholder="••••••"
              />
            </div>

            {error && (
              <div style={styles.errorRow}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle
                    cx="6.5"
                    cy="6.5"
                    r="5.5"
                    stroke="var(--accent)"
                    strokeWidth="1.1"
                  />
                  <path
                    d="M6.5 4v3M6.5 9v.5"
                    stroke="var(--accent)"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                <span style={styles.errorText}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              style={{
                ...styles.submitBtn,
                ...(loading || !username || !password
                  ? styles.submitBtnDisabled
                  : {}),
              }}
            >
              {loading ? (
                <span style={styles.loadingRow}>
                  <span style={styles.spinner} />
                  Authenticating…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div style={styles.cardFooter}>
            <span style={styles.footerText}>Default credentials:&nbsp;</span>
            <code style={styles.footerCode}>admin</code>
            <span style={styles.footerText}>&nbsp;/&nbsp;</span>
            <code style={styles.footerCode}>admin</code>
          </div>
        </div>

        <div style={styles.rightFooter}>
          <span style={styles.rightFooterText}>
            kprobe · infrastructure console
          </span>
          <span style={styles.rightFooterText}>Rust · Go · eBPF</span>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0e0e0f;
          --bg-subtle: #141415;
          --bg-elevated: #1a1a1b;
          --border: #242426;
          --border-subtle: #1e1e20;
          --text-primary: #f0eeeb;
          --text-secondary: #a09e9b;
          --text-muted: #5c5a57;
          --accent: #f59e0b;
          --accent-dim: rgba(245,158,11,0.12);
          --accent-dim-hover: rgba(245,158,11,0.2);
          --font: 'Raleway', system-ui, sans-serif;
          --radius-sm: 4px;
          --radius-md: 8px;
          --radius-lg: 12px;
        }

        body {
          font-family: var(--font);
          background: var(--bg);
          color: var(--text-primary);
          -webkit-font-smoothing: antialiased;
        }

        input:-webkit-autofill,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #1a1a1b inset !important;
          -webkit-text-fill-color: #f0eeeb !important;
          caret-color: #f0eeeb;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        #username:focus, #password:focus {
          outline: none;
          border-color: var(--accent) !important;
          background: var(--bg-elevated) !important;
        }

        button[type="submit"]:not(:disabled):hover {
          opacity: 0.88;
        }
      `}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    minHeight: "100vh",
    width: "100%",
    fontFamily: "'Raleway', system-ui, sans-serif",
    backgroundColor: "#0e0e0f",
    color: "#f0eeeb",
  },

  // Left panel
  left: {
    flex: 1,
    borderRight: "1px solid #1e1e20",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "3rem",
    backgroundColor: "#141415",
    minWidth: 0,
  },
  leftInner: {
    display: "flex",
    flexDirection: "column",
    gap: "2rem",
  },
  wordmark: {
    display: "flex",
    alignItems: "baseline",
    gap: "0",
    lineHeight: 1,
  },
  wordmarkK: {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#f59e0b",
    letterSpacing: "-0.04em",
  },
  wordmarkProbe: {
    fontFamily: "'Raleway', system-ui, sans-serif",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#f0eeeb",
    letterSpacing: "-0.04em",
  },
  leftTagline: {
    fontSize: "clamp(1.4rem, 2.2vw, 2rem)",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    lineHeight: 1.15,
    color: "#f0eeeb",
    maxWidth: "420px",
  },
  leftMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "0.625rem",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
  },
  metaDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    backgroundColor: "#f59e0b",
    opacity: 0.7,
    flexShrink: 0,
  },
  metaText: {
    fontSize: "0.8rem",
    color: "#5c5a57",
    fontWeight: 500,
  },

  // Decorative stream
  streamDecor: {
    border: "1px solid #1e1e20",
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: "#0e0e0f",
  },
  streamLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.62rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#5c5a57",
    padding: "0.625rem 0.875rem",
    borderBottom: "1px solid #1e1e20",
    fontFamily: "'JetBrains Mono', monospace",
  },
  streamPulse: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#f59e0b",
    flexShrink: 0,
    animation: "pulse 2s ease-in-out infinite",
  },
  streamRow: {
    display: "grid",
    gridTemplateColumns: "88px 100px 1fr",
    gap: "0.625rem",
    padding: "0.3rem 0.875rem",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "0.68rem",
    alignItems: "center",
  },
  streamRowHighlight: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderLeft: "2px solid #f59e0b",
    paddingLeft: "calc(0.875rem - 2px)",
  },
  streamRowMuted: {
    opacity: 0.35,
  },
  streamTs: {
    color: "#5c5a57",
    flexShrink: 0,
  },
  streamType: {
    fontWeight: 600,
    fontSize: "0.65rem",
    padding: "0.12em 0.4em",
    borderRadius: "3px",
    color: "#a09e9b",
    backgroundColor: "#1a1a1b",
    border: "1px solid #1e1e20",
    letterSpacing: "0.02em",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  streamTypeAccent: {
    color: "#f59e0b",
    backgroundColor: "rgba(245,158,11,0.12)",
    border: "1px solid transparent",
  },
  streamDetail: {
    color: "#5c5a57",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },

  // Right panel
  right: {
    width: "460px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "3rem",
    gap: "auto",
    position: "relative" as const,
  },
  card: {
    width: "100%",
    maxWidth: "360px",
    display: "flex",
    flexDirection: "column",
    gap: "1.75rem",
  },
  cardHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  cardTitle: {
    fontSize: "1.25rem",
    fontWeight: 700,
    letterSpacing: "-0.025em",
    color: "#f0eeeb",
  },
  cardSub: {
    fontSize: "0.8rem",
    color: "#5c5a57",
  },

  // Form
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
  },
  label: {
    fontSize: "0.72rem",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "#5c5a57",
  },
  input: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    backgroundColor: "#141415",
    border: "1px solid #242426",
    borderRadius: "4px",
    color: "#f0eeeb",
    fontSize: "0.875rem",
    fontFamily: "'Raleway', system-ui, sans-serif",
    fontWeight: 500,
    outline: "none",
    transition: "border-color 120ms ease, background-color 120ms ease",
  },
  inputError: {
    borderColor: "#f59e0b",
  },
  errorRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    backgroundColor: "rgba(245,158,11,0.08)",
    border: "1px solid rgba(245,158,11,0.2)",
    borderRadius: "4px",
  },
  errorText: {
    fontSize: "0.78rem",
    color: "#f59e0b",
    fontWeight: 500,
  },
  submitBtn: {
    width: "100%",
    padding: "0.625rem",
    backgroundColor: "#f59e0b",
    color: "#0e0e0f",
    border: "none",
    borderRadius: "4px",
    fontSize: "0.875rem",
    fontWeight: 700,
    fontFamily: "'Raleway', system-ui, sans-serif",
    letterSpacing: "0.02em",
    cursor: "pointer",
    marginTop: "0.25rem",
    transition: "opacity 120ms ease",
  },
  submitBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  loadingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
  },
  spinner: {
    width: "13px",
    height: "13px",
    border: "1.5px solid rgba(14,14,15,0.3)",
    borderTopColor: "#0e0e0f",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.7s linear infinite",
  },

  // Footer
  cardFooter: {
    display: "flex",
    alignItems: "center",
    padding: "0.75rem",
    backgroundColor: "#141415",
    border: "1px solid #1e1e20",
    borderRadius: "4px",
  },
  footerText: {
    fontSize: "0.72rem",
    color: "#5c5a57",
  },
  footerCode: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.7rem",
    color: "#f59e0b",
    backgroundColor: "rgba(245,158,11,0.1)",
    padding: "0.1em 0.4em",
    borderRadius: "3px",
  },
  rightFooter: {
    position: "absolute" as const,
    bottom: "2rem",
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
  },
  rightFooterText: {
    fontSize: "0.68rem",
    color: "#2a2a2c",
    fontWeight: 500,
  },
};

// ─── Mock event data ──────────────────────────────────────────────────────────

const MOCK_EVENTS = [
  {
    ts: "03:47:12.004",
    type: "tcp_sendmsg",
    detail: "payment-handler → settlement-svc",
    highlight: false,
    muted: false,
  },
  {
    ts: "03:47:12.005",
    type: "sys_write",
    detail: "fd=7 · ledger write initiated",
    highlight: false,
    muted: false,
  },
  {
    ts: "03:47:12.821",
    type: "mm_page_fault",
    detail: "PID 4721 · batch-job memory pressure",
    highlight: false,
    muted: false,
  },
  {
    ts: "03:47:12.822",
    type: "sched_switch",
    detail: "preempted · CPU 3 → PID 4721",
    highlight: true,
    muted: false,
  },
  {
    ts: "03:47:13.210",
    type: "sched_switch",
    detail: "resumed · CPU 3 · 388ms delayed",
    highlight: false,
    muted: false,
  },
  {
    ts: "03:47:13.621",
    type: "sys_write",
    detail: "fd=7 · completed · 802ms total",
    highlight: false,
    muted: false,
  },
  {
    ts: "03:47:13.622",
    type: "tcp_recvmsg",
    detail: "timeout — payment-handler · ERR",
    highlight: false,
    muted: true,
  },
];
