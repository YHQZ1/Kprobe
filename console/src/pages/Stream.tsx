import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType =
  | "tcp_sendmsg"
  | "tcp_recvmsg"
  | "sys_write"
  | "sys_read"
  | "sched_switch"
  | "mm_page_fault";

interface KernelEvent {
  id: string;
  timestamp: string;
  timestampNs: number;
  type: EventType;
  pid: number;
  tid: number;
  cpu: number;
  service: string;
  detail: string;
  duration: number | null; // microseconds
  meta: Record<string, string>;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const SERVICES = [
  "payment-handler",
  "settlement-svc",
  "risk-engine",
  "ledger-writer",
  "order-router",
  "batch-job",
];

const EVENT_TEMPLATES: Record<
  EventType,
  (
    pid: number,
    svc: string,
  ) => { detail: string; meta: Record<string, string>; duration: number | null }
> = {
  tcp_sendmsg: (_pid, svc) => ({
    detail: `${svc} → ${SERVICES[Math.floor(Math.random() * SERVICES.length)]} · ${(Math.random() * 8 + 0.5).toFixed(1)}kb`,
    meta: {
      src_port: String(40000 + Math.floor(Math.random() * 10000)),
      dst_port: "8080",
      bytes: String(Math.floor(Math.random() * 8192 + 512)),
      protocol: "TCP",
      direction: "egress",
    },
    duration: Math.floor(Math.random() * 800 + 50),
  }),
  tcp_recvmsg: (_pid, svc) => ({
    detail: `${svc} ← inbound · ${(Math.random() * 4 + 0.2).toFixed(1)}kb`,
    meta: {
      src_port: String(40000 + Math.floor(Math.random() * 10000)),
      dst_port: "8080",
      bytes: String(Math.floor(Math.random() * 4096 + 256)),
      protocol: "TCP",
      direction: "ingress",
    },
    duration: Math.floor(Math.random() * 400 + 20),
  }),
  sys_write: (_pid, _svc) => ({
    detail: `fd=${Math.floor(Math.random() * 10 + 3)} · ${["ledger write", "journal flush", "WAL append", "index update"][Math.floor(Math.random() * 4)]}`,
    meta: {
      fd: String(Math.floor(Math.random() * 10 + 3)),
      bytes: String(Math.floor(Math.random() * 16384 + 512)),
      offset: String(Math.floor(Math.random() * 1000000)),
      flags: "O_WRONLY|O_APPEND",
    },
    duration: Math.floor(Math.random() * 1200 + 100),
  }),
  sys_read: (_pid, _svc) => ({
    detail: `fd=${Math.floor(Math.random() * 10 + 3)} · ${["index scan", "page read", "WAL read", "snapshot fetch"][Math.floor(Math.random() * 4)]}`,
    meta: {
      fd: String(Math.floor(Math.random() * 10 + 3)),
      bytes: String(Math.floor(Math.random() * 8192 + 256)),
      offset: String(Math.floor(Math.random() * 1000000)),
      flags: "O_RDONLY",
    },
    duration: Math.floor(Math.random() * 600 + 50),
  }),
  sched_switch: (pid, _svc) => {
    const delayed = Math.random() > 0.7;
    const delay = delayed
      ? Math.floor(Math.random() * 600 + 100)
      : Math.floor(Math.random() * 40 + 2);
    return {
      detail: delayed
        ? `preempted · CPU ${Math.floor(Math.random() * 8)} → PID ${Math.floor(Math.random() * 9000 + 1000)} · ${delay}ms delayed`
        : `resumed · CPU ${Math.floor(Math.random() * 8)} · ${delay}ms`,
      meta: {
        prev_pid: String(pid),
        next_pid: String(Math.floor(Math.random() * 9000 + 1000)),
        cpu: String(Math.floor(Math.random() * 8)),
        delay_ms: String(delay),
        prev_state: delayed ? "TASK_RUNNING" : "TASK_INTERRUPTIBLE",
      },
      duration: delay * 1000,
    };
  },
  mm_page_fault: (_pid, _svc) => ({
    detail: `addr=0x${Math.floor(Math.random() * 0xffffffffffff)
      .toString(16)
      .padStart(
        12,
        "0",
      )} · ${["minor fault", "major fault", "memory pressure"][Math.floor(Math.random() * 3)]}`,
    meta: {
      address: `0x${Math.floor(Math.random() * 0xffffffffffff).toString(16)}`,
      fault_type: ["minor", "major"][Math.floor(Math.random() * 2)],
      vma_flags: "VM_READ|VM_WRITE",
      pgfault: String(Math.floor(Math.random() * 1000)),
    },
    duration: Math.floor(Math.random() * 2000 + 200),
  }),
};

const EVENT_TYPES = Object.keys(EVENT_TEMPLATES) as EventType[];

let _idN = 0;
let _baseNs = Date.now() * 1_000_000;

function generateEvent(): KernelEvent {
  _idN++;
  _baseNs += Math.floor(Math.random() * 800_000 + 100_000);

  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const pid = Math.floor(Math.random() * 9000 + 1000);
  const tid = pid + Math.floor(Math.random() * 4);
  const cpu = Math.floor(Math.random() * 8);
  const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  const { detail, meta, duration } = EVENT_TEMPLATES[type](pid, service);

  const now = new Date();
  const ts =
    [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":") +
    "." +
    String(now.getMilliseconds()).padStart(3, "0");

  return {
    id: `evt-${_idN}`,
    timestamp: ts,
    timestampNs: _baseNs,
    type,
    pid,
    tid,
    cpu,
    service,
    detail,
    duration,
    meta,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_EVENTS = 500;
const TICK_MS = 680;

const TYPE_LABELS: Record<EventType, string> = {
  tcp_sendmsg: "tcp_send",
  tcp_recvmsg: "tcp_recv",
  sys_write: "sys_write",
  sys_read: "sys_read",
  sched_switch: "sched",
  mm_page_fault: "page_fault",
};

function fmtDur(us: number | null): string {
  if (us === null) return "—";
  if (us < 1_000) return `${us}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}

function isSlow(us: number | null): boolean {
  return us !== null && us > 500_000;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StreamPage() {
  const [events, setEvents] = useState<KernelEvent[]>(() =>
    Array.from({ length: 28 }, generateEvent),
  );
  const [paused, setPaused] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<EventType>>(
    new Set(EVENT_TYPES),
  );
  const [eps, setEps] = useState(0);

  const pausedRef = useRef(paused);
  const tickRef = useRef(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  pausedRef.current = paused;

  // New event tick
  useEffect(() => {
    const iv = setInterval(() => {
      if (pausedRef.current) return;
      tickRef.current++;
      const evt = generateEvent();
      setEvents((prev) => {
        const next = [...prev, evt];
        return next.length > MAX_EVENTS
          ? next.slice(next.length - MAX_EVENTS)
          : next;
      });
      if (atBottomRef.current && tableRef.current) {
        requestAnimationFrame(() => {
          if (tableRef.current)
            tableRef.current.scrollTop = tableRef.current.scrollHeight;
        });
      }
    }, TICK_MS);
    return () => clearInterval(iv);
  }, []);

  // EPS counter
  useEffect(() => {
    const iv = setInterval(() => {
      setEps(tickRef.current);
      tickRef.current = 0;
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const handleScroll = useCallback(() => {
    if (!tableRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = tableRef.current;
    atBottomRef.current = scrollHeight - scrollTop - clientHeight < 60;
  }, []);

  function toggleType(type: EventType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return prev;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function togglePause() {
    setPaused((p) => {
      if (p) {
        requestAnimationFrame(() => {
          if (tableRef.current)
            tableRef.current.scrollTop = tableRef.current.scrollHeight;
        });
      }
      return !p;
    });
  }

  const filtered = events.filter((e) => activeTypes.has(e.type));

  return (
    <div style={s.root}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.tlLeft}>
          <span style={s.filterLabel}>filter</span>
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              style={{
                ...s.pill,
                ...(activeTypes.has(t) ? s.pillOn : s.pillOff),
              }}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div style={s.tlRight}>
          <button
            onClick={togglePause}
            style={{ ...s.ctrlBtn, ...(paused ? s.ctrlBtnOn : {}) }}
          >
            {paused ? (
              <>
                <PlayIcon /> resume
              </>
            ) : (
              <>
                <PauseIcon /> pause
              </>
            )}
          </button>
          <button
            onClick={() => {
              setEvents([]);
              setExpandedId(null);
            }}
            style={s.ctrlBtn}
          >
            <ClearIcon /> clear
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={s.statsBar}>
        <Stat num={filtered.length.toLocaleString()} label="events" />
        <StatDiv />
        <Stat num={String(eps)} label="per sec" />
        <StatDiv />
        <Stat num={`${activeTypes.size}/${EVENT_TYPES.length}`} label="types" />
        <StatDiv />
        <Stat num={paused ? "paused" : "live"} label="stream" accent={paused} />
        {events.length >= MAX_EVENTS - 20 && (
          <>
            <StatDiv />
            <Stat num={`${MAX_EVENTS} max`} label="buffer" accent />
          </>
        )}
      </div>

      {/* Table header */}
      <div style={s.thead}>
        <span style={{ ...s.th, width: COL.ts }}>timestamp</span>
        <span style={{ ...s.th, width: COL.type }}>type</span>
        <span style={{ ...s.th, width: COL.pid }}>pid</span>
        <span style={{ ...s.th, width: COL.cpu }}>cpu</span>
        <span style={{ ...s.th, width: COL.svc }}>service</span>
        <span style={{ ...s.th, flex: 1 }}>detail</span>
        <span style={{ ...s.th, width: COL.dur, textAlign: "right" }}>
          duration
        </span>
      </div>

      {/* Table body */}
      <div ref={tableRef} style={s.tbody} onScroll={handleScroll}>
        {filtered.length === 0 && (
          <div style={s.empty}>no events match current filters</div>
        )}

        {filtered.map((evt, idx) => {
          const open = expandedId === evt.id;
          const slow = isSlow(evt.duration);

          return (
            <div key={evt.id}>
              <div
                onClick={() => setExpandedId(open ? null : evt.id)}
                style={{
                  ...s.row,
                  backgroundColor: open
                    ? "var(--accent-dim)"
                    : idx % 2 === 0
                      ? "var(--bg)"
                      : "var(--bg-subtle)",
                  borderLeft: slow
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                }}
              >
                <span
                  style={{
                    ...s.td,
                    ...s.mono,
                    width: COL.ts,
                    color: "var(--text-muted)",
                    fontSize: "0.68rem",
                  }}
                >
                  {evt.timestamp}
                </span>
                <span style={{ ...s.td, width: COL.type }}>
                  <span style={{ ...s.badge, ...(slow ? s.badgeSlow : {}) }}>
                    {TYPE_LABELS[evt.type]}
                  </span>
                </span>
                <span
                  style={{
                    ...s.td,
                    ...s.mono,
                    width: COL.pid,
                    color: "var(--text-muted)",
                    fontSize: "0.68rem",
                  }}
                >
                  {evt.pid}
                </span>
                <span
                  style={{
                    ...s.td,
                    ...s.mono,
                    width: COL.cpu,
                    color: "var(--text-muted)",
                    fontSize: "0.68rem",
                  }}
                >
                  {evt.cpu}
                </span>
                <span
                  style={{
                    ...s.td,
                    ...s.mono,
                    width: COL.svc,
                    color: "var(--text-secondary)",
                    fontSize: "0.7rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {evt.service}
                </span>
                <span
                  style={{
                    ...s.td,
                    flex: 1,
                    color: "var(--text-secondary)",
                    fontSize: "0.775rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {evt.detail}
                </span>
                <span
                  style={{
                    ...s.td,
                    ...s.mono,
                    width: COL.dur,
                    textAlign: "right",
                    fontSize: "0.68rem",
                    color: slow ? "var(--accent)" : "var(--text-muted)",
                    fontWeight: slow ? 600 : 400,
                  }}
                >
                  {fmtDur(evt.duration)}
                </span>
              </div>

              {/* Expanded detail */}
              {open && (
                <div style={s.expanded}>
                  <div style={s.expandedInner}>
                    <ExpandSection label="event">
                      <KV k="type" v={evt.type} />
                      <KV k="pid" v={String(evt.pid)} />
                      <KV k="tid" v={String(evt.tid)} />
                      <KV k="cpu" v={String(evt.cpu)} />
                      <KV k="timestamp" v={evt.timestamp} />
                      <KV k="duration" v={fmtDur(evt.duration)} accent={slow} />
                    </ExpandSection>
                    <div style={s.expandDiv} />
                    <ExpandSection label="context">
                      <KV k="service" v={evt.service} />
                      <KV k="detail" v={evt.detail} />
                    </ExpandSection>
                    <div style={s.expandDiv} />
                    <ExpandSection label="raw fields">
                      {Object.entries(evt.meta).map(([k, v]) => (
                        <KV key={k} k={k} v={v} />
                      ))}
                    </ExpandSection>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({
  num,
  label,
  accent,
}: {
  num: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "0.35rem",
        paddingRight: "1rem",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.78rem",
          fontWeight: 700,
          color: accent ? "var(--accent)" : "var(--text-secondary)",
          letterSpacing: "-0.01em",
        }}
      >
        {num}
      </span>
      <span
        style={{
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StatDiv() {
  return (
    <div
      style={{
        width: "1px",
        height: "12px",
        backgroundColor: "var(--border-subtle)",
        marginRight: "1rem",
        flexShrink: 0,
      }}
    />
  );
}

function ExpandSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "0.58rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase" as const,
          color: "var(--accent)",
          marginBottom: "0.125rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.2rem 0.75rem",
          alignItems: "baseline",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function KV({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          whiteSpace: "nowrap" as const,
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: accent ? "var(--accent)" : "var(--text-secondary)",
          wordBreak: "break-all" as const,
          fontWeight: accent ? 600 : 400,
        }}
      >
        {v}
      </span>
    </>
  );
}

function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1.5" y="1" width="2.5" height="8" rx="0.5" fill="currentColor" />
      <rect x="6" y="1" width="2.5" height="8" rx="0.5" fill="currentColor" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 1.5l6 3.5-6 3.5V1.5z" fill="currentColor" />
    </svg>
  );
}
function ClearIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M2 2l6 6M8 2l-6 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Column widths ────────────────────────────────────────────────────────────

const COL = {
  ts: "96px",
  type: "96px",
  pid: "52px",
  cpu: "36px",
  svc: "144px",
  dur: "76px",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "var(--bg)",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 1.25rem",
    height: "44px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    gap: "1rem",
    backgroundColor: "var(--bg-subtle)",
  },
  tlLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    minWidth: 0,
    overflow: "hidden",
  },
  tlRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexShrink: 0,
  },
  filterLabel: {
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    marginRight: "0.25rem",
    flexShrink: 0,
  },
  pill: {
    padding: "0.2rem 0.55rem",
    borderRadius: "3px",
    fontSize: "0.63rem",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid transparent",
    letterSpacing: "0.02em",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.5,
  },
  pillOn: {
    backgroundColor: "var(--accent-dim)",
    color: "var(--accent)",
    borderColor: "rgba(245,158,11,0.25)",
  },
  pillOff: {
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    borderColor: "var(--border-subtle)",
  },
  ctrlBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.25rem 0.625rem",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    fontSize: "0.7rem",
    fontFamily: "var(--font)",
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
  },
  ctrlBtnOn: {
    backgroundColor: "var(--accent-dim)",
    borderColor: "rgba(245,158,11,0.3)",
    color: "var(--accent)",
  },
  statsBar: {
    display: "flex",
    alignItems: "center",
    padding: "0 1.25rem",
    height: "36px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    backgroundColor: "var(--bg)",
  },
  thead: {
    display: "flex",
    alignItems: "center",
    padding: "0 1.25rem",
    height: "30px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    backgroundColor: "var(--bg-subtle)",
    gap: "0.75rem",
  },
  th: {
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  tbody: {
    flex: 1,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4rem",
    fontFamily: "var(--font-mono)",
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    padding: "0 1.25rem",
    height: "34px",
    gap: "0.75rem",
    cursor: "pointer",
    userSelect: "none" as const,
    borderBottom: "1px solid transparent",
  },
  td: {
    flexShrink: 0,
    lineHeight: 1,
  },
  mono: {
    fontFamily: "var(--font-mono)",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
    padding: "0.15em 0.45em",
    borderRadius: "3px",
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
  },
  badgeSlow: {
    backgroundColor: "var(--accent-dim)",
    borderColor: "rgba(245,158,11,0.2)",
    color: "var(--accent)",
  },
  expanded: {
    backgroundColor: "var(--bg-subtle)",
    borderTop: "1px solid var(--border-subtle)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  expandedInner: {
    display: "flex",
    gap: 0,
    padding: "1rem 1.25rem",
  },
  expandDiv: {
    width: "1px",
    backgroundColor: "var(--border-subtle)",
    margin: "0 1.5rem",
    flexShrink: 0,
  },
};
