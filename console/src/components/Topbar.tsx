import type { ConnectionStatus } from "../types/events";
import { SunIcon, MoonIcon, LogoutIcon } from "./ui/icons";

interface TopbarProps {
  title: string;
  description?: string;
  status: ConnectionStatus;
  onLogout: () => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

function statusColor(status: ConnectionStatus): string {
  if (status === "connected") return "var(--accent)";
  if (status === "mock") return "var(--text-muted)";
  if (status === "connecting") return "var(--text-muted)";
  return "var(--border)";
}

function statusAnimation(status: ConnectionStatus): string {
  return status === "connecting" ? "pulse 1.4s ease-in-out infinite" : "none";
}

function statusLabel(status: ConnectionStatus): string {
  if (status === "mock") return "mock";
  return status;
}

function endpointLabel(status: ConnectionStatus): string {
  if (status === "mock") return "no backend · mock data";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export default function Topbar({
  title,
  description,
  status,
  onLogout,
  theme,
  onThemeToggle,
}: TopbarProps) {
  const dotColor = statusColor(status);
  const textColor =
    status === "connected" ? "var(--accent)" : "var(--text-muted)";

  return (
    <header style={s.root}>
      <div style={s.left}>
        <span style={s.title}>{title}</span>
        {description && (
          <>
            <span style={s.sep}>·</span>
            <span style={s.desc}>{description}</span>
          </>
        )}
      </div>

      <div style={s.right}>
        <div style={s.statusPill}>
          <span
            style={{
              ...s.statusDot,
              backgroundColor: dotColor,
              animation: statusAnimation(status),
            }}
          />
          <span style={{ ...s.statusText, color: textColor }}>
            {statusLabel(status)}
          </span>
          <span style={s.statusEndpoint}>{endpointLabel(status)}</span>
        </div>

        <div style={s.divider} />

        <button
          onClick={onThemeToggle}
          style={s.iconBtn}
          aria-label="Toggle theme"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

        <div style={s.divider} />

        <div style={s.userRow}>
          <span style={s.userLabel}>admin</span>
          <button
            onClick={onLogout}
            style={s.iconBtn}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogoutIcon />
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
    transition: "background-color 120ms ease, color 120ms ease",
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
