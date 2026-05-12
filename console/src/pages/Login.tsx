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
    <div style={s.root}>
      {/* Left panel — branding */}
      <div style={s.left}>
        <div style={s.leftInner}>
          <div style={s.wordmark}>
            <span style={s.wordmarkK}>k</span>
            <span style={s.wordmarkProbe}>probe</span>
          </div>
          <p style={s.leftTagline}>
            Kernel-level observability
            <br />
            for financial systems.
          </p>
          <div style={s.leftMeta}>
            <div style={s.metaRow}>
              <span style={s.metaDot} />
              <span style={s.metaText}>eBPF · zero instrumentation</span>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaDot} />
              <span style={s.metaText}>
                causal graphs · nanosecond precision
              </span>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaDot} />
              <span style={s.metaText}>deterministic incident replay</span>
            </div>
          </div>
        </div>

        {/* Decorative kernel event stream */}
        <div style={s.streamDecor}>
          <div style={s.streamLabel}>
            <span style={s.streamPulse} />
            live · kernel event stream
          </div>
          {MOCK_EVENTS.map((ev, i) => (
            <div
              key={i}
              style={{
                ...s.streamRow,
                ...(ev.highlight ? s.streamRowHighlight : {}),
                ...(ev.muted ? s.streamRowMuted : {}),
              }}
            >
              <span style={s.streamTs}>{ev.ts}</span>
              <span
                style={{
                  ...s.streamType,
                  ...(ev.highlight ? s.streamTypeAccent : {}),
                }}
              >
                {ev.type}
              </span>
              <span style={s.streamDetail}>{ev.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={s.right}>
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>Sign in</div>
            <div style={s.cardSub}>Access the kprobe console</div>
          </div>

          <form onSubmit={handleSubmit} style={s.form}>
            <div style={s.field}>
              <label style={s.label} htmlFor="username">
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
                  ...s.input,
                  ...(error ? s.inputError : {}),
                }}
                placeholder="admin"
                spellCheck={false}
              />
            </div>

            <div style={s.field}>
              <label style={s.label} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  ...s.input,
                  ...(error ? s.inputError : {}),
                }}
                placeholder="••••••"
              />
            </div>

            {error && (
              <div style={s.errorRow}>
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
                <span style={s.errorText}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              style={{
                ...s.submitBtn,
                ...(loading || !username || !password
                  ? s.submitBtnDisabled
                  : {}),
              }}
            >
              {loading ? (
                <span style={s.loadingRow}>
                  <span style={s.spinner} />
                  Authenticating…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div style={s.cardFooter}>
            <span style={s.footerText}>Default credentials:&nbsp;</span>
            <code style={s.footerCode}>admin</code>
            <span style={s.footerText}>&nbsp;/&nbsp;</span>
            <code style={s.footerCode}>admin</code>
          </div>
        </div>

        <div style={s.rightFooter}>
          <span style={s.rightFooterText}>kprobe · infrastructure console</span>
          <span style={s.rightFooterText}>Rust · Go · eBPF</span>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    minHeight: "100vh",
    width: "100%",
    fontFamily: "var(--font)",
    backgroundColor: "var(--bg)",
    color: "var(--text-primary)",
  },

  // Left panel
  left: {
    flex: 1,
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "3rem",
    backgroundColor: "var(--bg-subtle)",
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
    lineHeight: 1,
  },
  wordmarkK: {
    fontFamily: "var(--font-mono)",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "var(--accent)",
    letterSpacing: "-0.04em",
  },
  wordmarkProbe: {
    fontFamily: "var(--font)",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "var(--text-primary)",
    letterSpacing: "-0.04em",
  },
  leftTagline: {
    fontSize: "clamp(1.4rem, 2.2vw, 2rem)",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    lineHeight: 1.15,
    color: "var(--text-primary)",
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
    backgroundColor: "var(--accent)",
    opacity: 0.7,
    flexShrink: 0,
  },
  metaText: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    fontWeight: 500,
  },

  // Decorative stream
  streamDecor: {
    border: "1px solid var(--border-subtle)",
    overflow: "hidden",
    backgroundColor: "var(--bg)",
  },
  streamLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.62rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    padding: "0.625rem 0.875rem",
    borderBottom: "1px solid var(--border-subtle)",
    fontFamily: "var(--font-mono)",
  },
  streamPulse: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "var(--accent)",
    flexShrink: 0,
    animation: "pulse 2s ease-in-out infinite",
  },
  streamRow: {
    display: "grid",
    gridTemplateColumns: "88px 100px 1fr",
    gap: "0.625rem",
    padding: "0.3rem 0.875rem",
    fontFamily: "var(--font-mono)",
    fontSize: "0.68rem",
    alignItems: "center",
  },
  streamRowHighlight: {
    backgroundColor: "var(--accent-dim)",
    borderLeft: "2px solid var(--accent)",
    paddingLeft: "calc(0.875rem - 2px)",
  },
  streamRowMuted: {
    opacity: 0.35,
  },
  streamTs: {
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  streamType: {
    fontWeight: 600,
    fontSize: "0.65rem",
    padding: "0.12em 0.4em",
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    letterSpacing: "0.02em",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  streamTypeAccent: {
    color: "var(--accent)",
    backgroundColor: "var(--accent-dim)",
    border: "1px solid transparent",
  },
  streamDetail: {
    color: "var(--text-muted)",
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
    color: "var(--text-primary)",
  },
  cardSub: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
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
    color: "var(--text-muted)",
  },
  input: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    backgroundColor: "var(--bg-subtle)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontSize: "0.875rem",
    fontFamily: "var(--font)",
    fontWeight: 500,
    outline: "none",
    // radius intentionally omitted — inherits var(--radius-sm) = 0px
    // consistent with the rest of the app's sharp aesthetic
  },
  inputError: {
    borderColor: "var(--accent)",
  },
  errorRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    backgroundColor: "var(--accent-dim)",
    border: "1px solid rgba(245,158,11,0.2)",
  },
  errorText: {
    fontSize: "0.78rem",
    color: "var(--accent)",
    fontWeight: 500,
  },
  submitBtn: {
    width: "100%",
    padding: "0.625rem",
    backgroundColor: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    fontSize: "0.875rem",
    fontWeight: 700,
    fontFamily: "var(--font)",
    letterSpacing: "0.02em",
    cursor: "pointer",
    marginTop: "0.25rem",
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
    borderTopColor: "var(--bg)",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.7s linear infinite",
  },

  // Footer
  cardFooter: {
    display: "flex",
    alignItems: "center",
    padding: "0.75rem",
    backgroundColor: "var(--bg-subtle)",
    border: "1px solid var(--border-subtle)",
  },
  footerText: {
    fontSize: "0.72rem",
    color: "var(--text-muted)",
  },
  footerCode: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.7rem",
    color: "var(--accent)",
    backgroundColor: "var(--accent-dim)",
    padding: "0.1em 0.4em",
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
    color: "var(--border)",
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
