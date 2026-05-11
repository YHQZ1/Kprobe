import type { ConnectionStatus } from "../hooks/useConnection";

interface TopbarProps {
  title: string;
  description?: string;
  status: ConnectionStatus;
  onLogout: () => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

export default function Topbar({
  title,
  description,
  status,
  onLogout,
  theme,
  onThemeToggle,
}: TopbarProps) {
  return (
    <header style={s.root}>
      {/* Left — view title */}
      <div style={s.left}>
        <span style={s.title}>{title}</span>
        {description && (
          <>
            <span style={s.sep}>·</span>
            <span style={s.desc}>{description}</span>
          </>
        )}
      </div>

      {/* Right — status + controls */}
      <div style={s.right}>
        {/* Connection status */}
        <div style={s.statusPill}>
          <span
            style={{
              ...s.statusDot,
              backgroundColor:
                status === "connected"
                  ? "var(--accent)"
                  : status === "connecting"
                    ? "var(--text-muted)"
                    : "var(--border)",
              animation:
                status === "connecting"
                  ? "pulse 1.4s ease-in-out infinite"
                  : "none",
            }}
          />
          <span
            style={{
              ...s.statusText,
              color:
                status === "connected"
                  ? "var(--accent)"
                  : status === "connecting"
                    ? "var(--text-muted)"
                    : "var(--text-muted)",
            }}
          >
            {status}
          </span>
          <span style={s.statusEndpoint}>ws://localhost:8080</span>
        </div>

        <div style={s.divider} />

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          style={s.iconBtn}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {theme === "dark" ? (
            /* Sun icon */
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle
                cx="7"
                cy="7"
                r="2.8"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            /* Moon icon */
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M12 9A6 6 0 015 2a6 6 0 100 10 6 6 0 007-3z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <div style={s.divider} />

        {/* User + logout */}
        <div style={s.userRow}>
          <span style={s.userLabel}>admin</span>
          <button
            onClick={onLogout}
            style={s.iconBtn}
            aria-label="Sign out"
            title="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M5.5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 9.5L12 7l-2.5-2.5M12 7H5.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    height: "var(--topbar-height)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: "1.25rem",
    paddingRight: "1rem",
    borderBottom: "1px solid var(--border-subtle)",
    backgroundColor: "var(--bg)",
    flexShrink: 0,
    gap: "1rem",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    minWidth: 0,
  },
  title: {
    fontSize: "0.825rem",
    fontWeight: 700,
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
  },
  sep: {
    color: "var(--border)",
    fontSize: "0.875rem",
    flexShrink: 0,
  },
  desc: {
    fontSize: "0.775rem",
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexShrink: 0,
  },
  statusPill: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.25rem 0.625rem",
    backgroundColor: "var(--bg-subtle)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
  },
  statusDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusText: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  statusEndpoint: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
    letterSpacing: "0.02em",
  },
  divider: {
    width: "1px",
    height: "16px",
    backgroundColor: "var(--border-subtle)",
    flexShrink: 0,
  },
  iconBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    backgroundColor: "transparent",
    border: "1px solid transparent",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  userLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.68rem",
    color: "var(--text-secondary)",
    fontWeight: 500,
  },
};
