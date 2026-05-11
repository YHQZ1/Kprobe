import { NavLink, useLocation } from "react-router-dom";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    path: "/stream",
    label: "Live Stream",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path
          d="M2 7.5h3l2-5 3 10 2-5h1"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    path: "/graph",
    label: "Causal Graph",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle
          cx="7.5"
          cy="3"
          r="1.75"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle
          cx="2.5"
          cy="12"
          r="1.75"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle
          cx="12.5"
          cy="12"
          r="1.75"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M7.5 4.75v1.5M6.1 6.8L3.3 10.4M8.9 6.8l2.8 3.6"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    path: "/timeline",
    label: "Timeline",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <line
          x1="1"
          y1="4.5"
          x2="14"
          y2="4.5"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <line
          x1="1"
          y1="7.5"
          x2="14"
          y2="7.5"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="2.5 2"
        />
        <line
          x1="1"
          y1="10.5"
          x2="14"
          y2="10.5"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="1.5 2.5"
        />
        <rect
          x="3"
          y="3.25"
          width="2.5"
          height="2.5"
          rx="0.5"
          fill="currentColor"
          opacity="0.7"
        />
        <rect
          x="8"
          y="6.25"
          width="2.5"
          height="2.5"
          rx="0.5"
          fill="currentColor"
          opacity="0.7"
        />
        <rect
          x="5.5"
          y="9.25"
          width="2.5"
          height="2.5"
          rx="0.5"
          fill="currentColor"
          opacity="0.7"
        />
      </svg>
    ),
  },
  {
    path: "/replay",
    label: "Replay",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path
          d="M2.5 7.5A5 5 0 1112.5 7.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M2.5 4.5v3h3"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M6.5 5.5l3 2-3 2v-4z" fill="currentColor" opacity="0.8" />
      </svg>
    ),
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  {
    path: "/settings",
    label: "Settings",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle
          cx="7.5"
          cy="7.5"
          r="2"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M7.5 1.5v1.2M7.5 12.3v1.2M1.5 7.5h1.2M12.3 7.5h1.2M3.4 3.4l.85.85M10.75 10.75l.85.85M3.4 11.6l.85-.85M10.75 4.25l.85-.85"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside style={s.root}>
      {/* Logo */}
      <div style={s.logo}>
        <span style={s.logoK}>k</span>
        <span style={s.logoProbe}>probe</span>
      </div>

      {/* Main nav */}
      <nav style={s.nav}>
        <div style={s.navGroup}>
          <div style={s.navGroupLabel}>views</div>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                style={{
                  ...s.navItem,
                  ...(active ? s.navItemActive : {}),
                }}
              >
                <span
                  style={{
                    ...s.navIcon,
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {item.icon}
                </span>
                <span
                  style={{
                    ...s.navLabel,
                    color: active
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {item.label}
                </span>
                {active && <span style={s.activeBar} />}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Bottom nav */}
      <div style={s.bottom}>
        <div style={s.bottomDivider} />
        {BOTTOM_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={{
                ...s.navItem,
                ...(active ? s.navItemActive : {}),
              }}
            >
              <span
                style={{
                  ...s.navIcon,
                  color: active ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {item.icon}
              </span>
              <span
                style={{
                  ...s.navLabel,
                  color: active
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {item.label}
              </span>
              {active && <span style={s.activeBar} />}
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    width: "var(--sidebar-width)",
    flexShrink: 0,
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border-subtle)",
    backgroundColor: "var(--bg-subtle)",
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 10,
  },
  logo: {
    display: "flex",
    alignItems: "baseline",
    gap: 0,
    padding: "0 1rem",
    height: "var(--topbar-height)",
    borderBottom: "1px solid var(--border-subtle)",
    alignSelf: "stretch",
    flexShrink: 0,
  },
  logoK: {
    fontFamily: "var(--font-mono)",
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--accent)",
    letterSpacing: "-0.04em",
    lineHeight: "var(--topbar-height)",
  },
  logoProbe: {
    fontFamily: "var(--font)",
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--text-primary)",
    letterSpacing: "-0.04em",
    lineHeight: "var(--topbar-height)",
  },
  nav: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "1rem 0",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  navGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  navGroupLabel: {
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    padding: "0 1rem 0.5rem",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    padding: "0.5rem 1rem",
    position: "relative" as const,
    cursor: "pointer",
    textDecoration: "none",
    userSelect: "none" as const,
  },
  navItemActive: {
    backgroundColor: "var(--accent-dim)",
  },
  navIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "15px",
    height: "15px",
  },
  navLabel: {
    fontSize: "0.8rem",
    letterSpacing: "-0.01em",
    lineHeight: 1,
  },
  activeBar: {
    position: "absolute" as const,
    right: 0,
    top: "50%",
    transform: "translateY(-50%)",
    width: "2px",
    height: "16px",
    backgroundColor: "var(--accent)",
    borderRadius: "1px 0 0 1px",
  },
  bottom: {
    paddingBottom: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  bottomDivider: {
    height: "1px",
    backgroundColor: "var(--border-subtle)",
    margin: "0 0 0.75rem",
  },
};
