import { useState, useEffect } from "react";

interface Settings {
  version: number;
  apiHost: string;
  apiPort: string;
  wsReconnect: boolean;
  theme: "dark" | "light" | "system";
  timestampFormat: "relative" | "absolute" | "nanosecond";
  maxStreamEvents: number;
  maxGraphNodes: number;
  retentionDays: number;
  autoExport: boolean;
  exportPath: string;
  probeOverhead: "minimal" | "standard" | "verbose";
}

const DEFAULTS: Settings = {
  version: 1,
  apiHost: "localhost",
  apiPort: "8080",
  wsReconnect: true,
  theme: "dark",
  timestampFormat: "absolute",
  maxStreamEvents: 500,
  maxGraphNodes: 40,
  retentionDays: 7,
  autoExport: false,
  exportPath: "/var/log/kprobe/exports",
  probeOverhead: "standard",
};

const STORAGE_KEY = "kprobe_settings";
const IS_DEV = import.meta.env.DEV;

function loadFromStorage(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    if (parsed.version !== DEFAULTS.version) return DEFAULTS;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function saveToStorage(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Search" },
  { keys: ["G"], label: "Go to Graph" },
  { keys: ["S"], label: "Go to Stream" },
  { keys: ["T"], label: "Go to Timeline" },
  { keys: ["R"], label: "Go to Replay" },
  { keys: ["Space"], label: "Play / pause replay" },
  { keys: ["←"], label: "Step back (replay)" },
  { keys: ["→"], label: "Step forward (replay)" },
  { keys: ["Esc"], label: "Deselect / close panel" },
  { keys: ["scroll"], label: "Zoom timeline" },
  { keys: ["⌘", "shift", "C"], label: "Clear current view" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(
    IS_DEV ? loadFromStorage() : DEFAULTS,
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (IS_DEV) return; // localStorage already loaded in useState initialiser
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setSettings(data))
      .catch(() => {}); // backend not running — stay on defaults
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    if (IS_DEV) {
      saveToStorage(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // backend not available
    }
  }

  async function handleReset() {
    if (IS_DEV) {
      localStorage.removeItem(STORAGE_KEY);
      setSettings(DEFAULTS);
      setSaved(false);
      return;
    }
    try {
      await fetch("/api/settings/reset", { method: "POST" });
      setSettings(DEFAULTS);
      setSaved(false);
    } catch {
      // backend not available
    }
  }

  const isDirty = JSON.stringify(settings) !== JSON.stringify(DEFAULTS);

  return (
    <div style={s.root}>
      <style>{`
        .settings-slider {
          width: 140px;
          accent-color: var(--text-secondary);
          cursor: pointer;
        }
        .settings-input {
          padding: 0.3rem 0.625rem;
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 0px;
          color: var(--text-primary);
          font-size: 0.68rem;
          font-family: var(--font-mono);
          outline: none;
          box-shadow: none;
        }
        .settings-input:focus {
          border-color: var(--accent);
        }
        .settings-toggle {
          width: 36px;
          height: 20px;
          border-radius: 0px;
          border: 1px solid var(--border);
          background-color: var(--bg-elevated);
          cursor: pointer;
          position: relative;
          padding: 0;
          flex-shrink: 0;
        }
        .settings-toggle.on {
          background-color: var(--accent-dim);
          border-color: var(--accent);
        }
        .settings-toggle-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 14px;
          height: 14px;
          border-radius: 0px;
          background-color: var(--text-muted);
        }
        .settings-toggle-thumb.on {
          transform: translateX(16px);
          background-color: var(--accent);
        }
        .settings-btn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.3rem 0.875rem;
          background-color: transparent;
          border: 1px solid var(--border);
          border-radius: 0px;
          color: var(--text-muted);
          font-size: 0.65rem;
          font-family: var(--font-mono);
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.04em;
        }
        .settings-btn:hover {
          background-color: var(--bg-elevated);
        }
        .settings-btn.primary {
          background-color: var(--accent-dim);
          border-color: var(--accent);
          color: var(--accent);
        }
        .settings-btn.primary:hover {
          background-color: var(--bg-elevated);
        }
        .settings-btn.success {
          background-color: var(--bg-elevated);
          border-color: var(--border);
          color: var(--text-primary);
        }
        .settings-seg-btn {
          padding: 0.25rem 0.625rem;
          font-size: 0.63rem;
          font-family: var(--font-mono);
          font-weight: 600;
          cursor: pointer;
          border: none;
          border-right: 1px solid var(--border);
          background-color: transparent;
          color: var(--text-muted);
          letter-spacing: 0.03em;
        }
        .settings-seg-btn:hover {
          background-color: var(--bg-elevated);
        }
        .settings-seg-btn.on {
          background-color: var(--accent-dim);
          color: var(--accent);
        }
      `}</style>

      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>settings</div>
          <div style={s.headerSub}>
            {IS_DEV
              ? "mock mode · changes saved to localStorage"
              : "console configuration — changes apply immediately"}
          </div>
        </div>
        <div style={s.headerActions}>
          {isDirty && (
            <button className="settings-btn" onClick={handleReset}>
              reset to defaults
            </button>
          )}
          <button
            className={`settings-btn ${saved ? "success" : "primary"}`}
            onClick={handleSave}
          >
            {saved ? (
              <>
                <CheckIcon /> saved
              </>
            ) : (
              "save changes"
            )}
          </button>
        </div>
      </div>

      <div style={s.body}>
        <Section
          title="connection"
          subtitle="API server and WebSocket configuration"
        >
          <Row label="API host" sub="Go gRPC/WebSocket server address">
            <input
              className="settings-input"
              style={{ width: "180px" }}
              value={settings.apiHost}
              onChange={(e) => set("apiHost", e.target.value)}
              spellCheck={false}
            />
          </Row>
          <Row label="API port" sub="Default: 8080">
            <input
              className="settings-input"
              style={{ width: "80px" }}
              value={settings.apiPort}
              onChange={(e) => set("apiPort", e.target.value)}
              spellCheck={false}
            />
          </Row>
          <Row label="WebSocket URL" sub="Derived from host and port">
            <span style={s.derived}>
              ws://{settings.apiHost}:{settings.apiPort}/ws
            </span>
          </Row>
          <Row
            label="Auto-reconnect"
            sub="Reconnect with exponential backoff on disconnect"
          >
            <Toggle
              value={settings.wsReconnect}
              onChange={(v) => set("wsReconnect", v)}
            />
          </Row>
        </Section>

        <Divider />

        <Section title="display" subtitle="Visual preferences for the console">
          <Row label="Theme" sub="Interface colour scheme">
            <SegControl
              options={[
                { value: "dark", label: "dark" },
                { value: "light", label: "light" },
                { value: "system", label: "system" },
              ]}
              value={settings.theme}
              onChange={(v) => {
                set("theme", v as Settings["theme"]);
                if (v !== "system") {
                  document.documentElement.setAttribute("data-theme", v);
                } else {
                  const isDark = window.matchMedia(
                    "(prefers-color-scheme: dark)",
                  ).matches;
                  document.documentElement.setAttribute(
                    "data-theme",
                    isDark ? "dark" : "light",
                  );
                }
              }}
            />
          </Row>
          <Row
            label="Timestamp format"
            sub="How event timestamps are displayed"
          >
            <SegControl
              options={[
                { value: "absolute", label: "absolute" },
                { value: "relative", label: "relative" },
                { value: "nanosecond", label: "nanosecond" },
              ]}
              value={settings.timestampFormat}
              onChange={(v) =>
                set("timestampFormat", v as Settings["timestampFormat"])
              }
            />
          </Row>
          <Row
            label="Max stream events"
            sub="Buffer size for the live event stream"
          >
            <div style={s.numRow}>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                value={settings.maxStreamEvents}
                onChange={(e) => set("maxStreamEvents", Number(e.target.value))}
                className="settings-slider"
              />
              <span style={s.numVal}>
                {settings.maxStreamEvents.toLocaleString()}
              </span>
            </div>
          </Row>
          <Row
            label="Max graph nodes"
            sub="Node limit for the causal graph view"
          >
            <div style={s.numRow}>
              <input
                type="range"
                min={10}
                max={200}
                step={10}
                value={settings.maxGraphNodes}
                onChange={(e) => set("maxGraphNodes", Number(e.target.value))}
                className="settings-slider"
              />
              <span style={s.numVal}>{settings.maxGraphNodes}</span>
            </div>
          </Row>
        </Section>

        <Divider />

        <Section title="data" subtitle="Event retention and export settings">
          <Row
            label="Retention window"
            sub="How long raw events are kept in ClickHouse"
          >
            <div style={s.numRow}>
              <input
                type="range"
                min={1}
                max={90}
                step={1}
                value={settings.retentionDays}
                onChange={(e) => set("retentionDays", Number(e.target.value))}
                className="settings-slider"
              />
              <span style={s.numVal}>{settings.retentionDays}d</span>
            </div>
          </Row>
          <Row
            label="Auto-export incidents"
            sub="Write incident snapshots to disk on detection"
          >
            <Toggle
              value={settings.autoExport}
              onChange={(v) => set("autoExport", v)}
            />
          </Row>
          {settings.autoExport && (
            <Row
              label="Export path"
              sub="Directory for incident snapshot files"
            >
              <input
                className="settings-input"
                style={{ width: "260px" }}
                value={settings.exportPath}
                onChange={(e) => set("exportPath", e.target.value)}
                spellCheck={false}
              />
            </Row>
          )}
        </Section>

        <Divider />

        <Section
          title="probe overhead"
          subtitle="eBPF capture verbosity — affects CPU usage on monitored nodes"
        >
          <Row
            label="Capture mode"
            sub="Controls which kernel hooks are active"
          >
            <SegControl
              options={[
                { value: "minimal", label: "minimal" },
                { value: "standard", label: "standard" },
                { value: "verbose", label: "verbose" },
              ]}
              value={settings.probeOverhead}
              onChange={(v) =>
                set("probeOverhead", v as Settings["probeOverhead"])
              }
            />
          </Row>
          <Row
            label="Active hooks"
            sub="Kernel tracepoints enabled at current mode"
          >
            <div style={s.hookList}>
              {getActiveHooks(settings.probeOverhead).map((h) => (
                <span key={h} style={s.hookBadge}>
                  {h}
                </span>
              ))}
            </div>
          </Row>
          <Row
            label="Estimated overhead"
            sub="Approximate CPU overhead per node"
          >
            <span
              style={{
                ...s.derived,
                color: overheadColor(settings.probeOverhead),
              }}
            >
              {overheadLabel(settings.probeOverhead)}
            </span>
          </Row>
        </Section>

        <Divider />

        <Section
          title="keyboard shortcuts"
          subtitle="Global hotkeys — active across all views"
        >
          <div style={s.shortcutGrid}>
            {SHORTCUTS.map((sc) => (
              <div key={sc.label} style={s.shortcutRow}>
                <span style={s.shortcutLabel}>{sc.label}</span>
                <div style={s.shortcutKeys}>
                  {sc.keys.map((k, i) => (
                    <kbd key={i} style={s.kbd}>
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Divider />

        <Section title="about" subtitle="">
          <div style={s.aboutGrid}>
            <AboutRow k="version" v="0.1.0-dev" />
            <AboutRow k="build" v="phase-4-console" />
            <AboutRow k="go version" v="1.24.1" />
            <AboutRow k="rust" v="1.77 (aya)" />
            <AboutRow k="node" v="20.x" />
            <AboutRow k="repository" v="github.com/YHQZ1/kprobe" link />
          </div>
        </Section>

        <div style={{ height: "3rem" }} />
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActiveHooks(mode: Settings["probeOverhead"]): string[] {
  const minimal = ["tcp_sendmsg", "tcp_recvmsg", "sys_write"];
  const standard = [...minimal, "sys_read", "sched_switch", "mm_page_fault"];
  const verbose = [
    ...standard,
    "sys_open",
    "sys_close",
    "sys_mmap",
    "tcp_connect",
    "tcp_disconnect",
  ];
  return mode === "minimal"
    ? minimal
    : mode === "standard"
      ? standard
      : verbose;
}

function overheadLabel(mode: Settings["probeOverhead"]): string {
  return mode === "minimal"
    ? "< 0.5% CPU"
    : mode === "standard"
      ? "0.5–1.5% CPU"
      : "1.5–3% CPU";
}

function overheadColor(mode: Settings["probeOverhead"]): string {
  return mode === "minimal"
    ? "var(--text-muted)"
    : mode === "standard"
      ? "var(--accent)"
      : "var(--text-primary)";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div style={s.section}>
      <div style={s.sectionHead}>
        <span style={s.sectionTitle}>{title}</span>
        {subtitle && <span style={s.sectionSub}>{subtitle}</span>}
      </div>
      <div style={s.sectionBody}>{children}</div>
    </div>
  );
}

function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div style={s.row}>
      <div style={s.rowMeta}>
        <span style={s.rowLabel}>{label}</span>
        {sub && <span style={s.rowSub}>{sub}</span>}
      </div>
      <div style={s.rowControl}>{children}</div>
    </div>
  );
}

function Divider() {
  return <div style={s.divider} />;
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`settings-toggle ${value ? "on" : ""}`}
    >
      <div className={`settings-toggle-thumb ${value ? "on" : ""}`} />
    </button>
  );
}

function SegControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={s.seg}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`settings-seg-btn ${value === opt.value ? "on" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function AboutRow({ k, v, link }: { k: string; v: string; link?: boolean }) {
  return (
    <>
      <span style={s.aboutKey}>{k}</span>
      {link ? (
        <a
          href={`https://${v}`}
          target="_blank"
          rel="noreferrer"
          style={s.aboutLink}
        >
          {v}
        </a>
      ) : (
        <span style={s.aboutVal}>{v}</span>
      )}
    </>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path
        d="M2 5.5l2.5 2.5 4.5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "var(--bg)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.875rem 1.25rem",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    backgroundColor: "var(--bg-subtle)",
  },
  headerTitle: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--text-primary)",
    marginBottom: "0.2rem",
  },
  headerSub: {
    fontSize: "0.62rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
  },
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "0 1.25rem",
  },
  section: {
    paddingTop: "1.75rem",
  },
  sectionHead: {
    marginBottom: "1.25rem",
  },
  sectionTitle: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--accent)",
    display: "block",
    marginBottom: "0.2rem",
  },
  sectionSub: {
    fontSize: "0.62rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
  },
  sectionBody: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 0",
    borderBottom: "1px solid var(--border-subtle)",
    gap: "2rem",
  },
  rowMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
    minWidth: 0,
  },
  rowLabel: {
    fontSize: "0.7rem",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    color: "var(--text-secondary)",
    letterSpacing: "0.02em",
  },
  rowSub: {
    fontSize: "0.6rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
  },
  rowControl: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },
  divider: {
    height: "1px",
    backgroundColor: "var(--border-subtle)",
    marginTop: "1.75rem",
  },
  derived: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.68rem",
    color: "var(--text-muted)",
    padding: "0.3rem 0.625rem",
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "0px",
  },
  numRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  numVal: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--text-secondary)",
    width: "48px",
    textAlign: "right" as const,
  },
  seg: {
    display: "flex",
    border: "1px solid var(--border)",
    borderRadius: "0px",
    overflow: "hidden",
  },
  hookList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.3rem",
    maxWidth: "380px",
    justifyContent: "flex-end",
  },
  hookBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.58rem",
    fontWeight: 600,
    padding: "0.15em 0.45em",
    borderRadius: "0px",
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-muted)",
    letterSpacing: "0.02em",
  },
  shortcutGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0 2rem",
  },
  shortcutRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.6rem 0",
    borderBottom: "1px solid var(--border-subtle)",
  },
  shortcutLabel: {
    fontSize: "0.68rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
  },
  shortcutKeys: {
    display: "flex",
    alignItems: "center",
    gap: "0.2rem",
  },
  kbd: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.6rem",
    fontWeight: 700,
    padding: "0.15rem 0.4rem",
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "0px",
    color: "var(--text-secondary)",
    letterSpacing: "0.02em",
  },
  aboutGrid: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    gap: "0.5rem 1.5rem",
    alignItems: "baseline",
  },
  aboutKey: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
  },
  aboutVal: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.68rem",
    color: "var(--text-secondary)",
  },
  aboutLink: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.68rem",
    color: "var(--accent)",
    textDecoration: "none",
  },
};
