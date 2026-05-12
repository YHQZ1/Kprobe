import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { EventType, KernelEvent } from "../types/events";
import {
  EVENT_TYPES,
  TYPE_LABELS,
  TYPE_COLORS,
  generateEvent,
  fmtDur,
  isSlow,
} from "../lib/mockData";
import {
  PauseIcon,
  PlayIcon,
  ClearIcon,
  CloseIcon,
} from "../components/ui/icons";
import { KV } from "../components/ui/KV";

const MAX_EVENTS = 500;
const TICK_MS = 680;

const COL = {
  ts: "96px",
  type: "108px",
  pid: "52px",
  cpu: "36px",
  svc: "144px",
  dur: "76px",
};

export default function StreamPage() {
  const [events, setEvents] = useState<KernelEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<EventType>>(
    new Set(EVENT_TYPES),
  );
  const [eps, setEps] = useState(0);

  const pausedRef = useRef(paused);
  const eventCountRef = useRef(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  pausedRef.current = paused;

  const handleNewEvent = useCallback((evt: KernelEvent) => {
    eventCountRef.current++;
    setEvents((prev) => {
      const next = [...prev, evt];
      return next.length > MAX_EVENTS
        ? next.slice(next.length - MAX_EVENTS)
        : next;
    });
  }, []);

  useEffect(() => {
    setEvents(Array.from({ length: 28 }, generateEvent));
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      if (pausedRef.current) return;

      handleNewEvent(generateEvent());

      if (atBottomRef.current && tableRef.current) {
        requestAnimationFrame(() => {
          if (tableRef.current) {
            tableRef.current.scrollTop = tableRef.current.scrollHeight;
          }
        });
      }
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [handleNewEvent]);

  useEffect(() => {
    const iv = setInterval(() => {
      setEps(eventCountRef.current);
      eventCountRef.current = 0;
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const handleScroll = useCallback(() => {
    if (!tableRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = tableRef.current;
    atBottomRef.current =
      Math.abs(scrollHeight - scrollTop - clientHeight) < 60;
  }, []);

  const filtered = useMemo(() => {
    return events.filter((e) => activeTypes.has(e.type));
  }, [events, activeTypes]);

  useEffect(() => {
    if (expandedId && !filtered.some((e) => e.id === expandedId)) {
      setExpandedId(null);
    }
  }, [filtered, expandedId]);

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
          if (tableRef.current) {
            tableRef.current.scrollTop = tableRef.current.scrollHeight;
          }
        });
      }
      return !p;
    });
  }

  function clearEvents() {
    setEvents([]);
    setExpandedId(null);
  }

  const isLastTypeStanding = activeTypes.size === 1;

  return (
    <div style={s.root}>
      <div style={s.toolbar}>
        <div style={s.tlLeft}>
          <span style={s.filterLabel}>filter</span>
          {EVENT_TYPES.map((t) => {
            const on = activeTypes.has(t);
            const c = TYPE_COLORS[t];
            const locked = on && isLastTypeStanding;
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                disabled={locked}
                title={
                  locked ? "At least one type must remain active" : undefined
                }
                style={{
                  ...s.pill,
                  backgroundColor: on ? c.bg : "transparent",
                  color: on ? c.text : "var(--text-muted)",
                  borderColor: on ? c.border : "var(--border-subtle)",
                  opacity: locked ? 0.5 : 1,
                  cursor: locked ? "not-allowed" : "pointer",
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
        <div style={s.tlRight}>
          <button
            onClick={togglePause}
            style={{ ...s.ctrlBtn, ...(paused ? s.ctrlBtnOn : {}) }}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? "resume" : "pause"}
          </button>
          <button onClick={clearEvents} style={s.ctrlBtn}>
            <ClearIcon /> clear
          </button>
        </div>
      </div>

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

      <div ref={tableRef} style={s.tbody} onScroll={handleScroll}>
        {filtered.length === 0 && (
          <div style={s.empty}>no events match current filters</div>
        )}

        {filtered.map((evt) => {
          const open = expandedId === evt.id;
          const slow = isSlow(evt.durationUs);
          const c = TYPE_COLORS[evt.type];

          return (
            <div key={evt.id}>
              <div
                className={`stream-row ${open ? "expanded" : ""}`}
                onClick={() => setExpandedId(open ? null : evt.id)}
                style={{
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
                  <span
                    style={{
                      ...s.badge,
                      backgroundColor: slow ? "var(--accent-dim)" : c.bg,
                      borderColor: slow ? "rgba(245,158,11,0.25)" : c.border,
                      color: slow ? "var(--accent)" : c.text,
                    }}
                  >
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
                  {fmtDur(evt.durationUs)}
                </span>
              </div>

              {open && (
                <div style={s.expanded}>
                  <div style={s.expandedHeader}>
                    <span style={s.expandedTitle}>event detail</span>
                    <button
                      onClick={() => setExpandedId(null)}
                      style={s.closeBtn}
                      aria-label="Close detail"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                  <div style={s.expandedInner}>
                    <ExpandSection label="event">
                      <KV k="type" v={evt.type} />
                      <KV k="pid" v={String(evt.pid)} />
                      <KV k="tid" v={String(evt.tid)} />
                      <KV k="cpu" v={String(evt.cpu)} />
                      <KV k="timestamp" v={evt.timestamp} />
                      <KV
                        k="duration"
                        v={fmtDur(evt.durationUs)}
                        accent={slow}
                      />
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
        minWidth: "160px",
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
    flexWrap: "wrap" as const,
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
    borderRadius: "0px",
    fontSize: "0.63rem",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid transparent",
    letterSpacing: "0.02em",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.5,
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
    borderRadius: "0px",
    border: "1px solid",
    whiteSpace: "nowrap" as const,
  },
  expanded: {
    backgroundColor: "var(--bg-subtle)",
    borderTop: "1px solid var(--border-subtle)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  expandedHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.625rem 1.25rem 0",
  },
  expandedTitle: {
    fontSize: "0.58rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  },
  closeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 0,
  },
  expandedInner: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "1rem",
    padding: "0.875rem 1.25rem 1rem",
  },
  expandDiv: {
    width: "1px",
    backgroundColor: "var(--border-subtle)",
    flexShrink: 0,
    alignSelf: "stretch",
  },
};
