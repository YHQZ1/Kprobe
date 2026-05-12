import { useState, useEffect, useRef, useCallback } from "react";
import type { EventType } from "../types/events";
import {
  type KernelEvent,
  EVENT_TYPES,
  TYPE_SHORT,
  TYPE_COLORS,
  SERVICES,
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

type TimeWindow = 1 | 5 | 30 | 0;

const MAX_EVENTS = 2000;
const TICK_MS = 120;
const LANE_H = 56;
const LANE_LABEL_W = 132;
const RULER_H = 28;
const BAR_H = 20;
const BAR_Y_OFFSET = (LANE_H - BAR_H) / 2;
const MIN_BAR_W = 3;
const CAUSAL_WINDOW_NS = 8_000_000;

function fmtNs(ns: number): string {
  if (ns < 1_000) return `${ns}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`;
  return `${(ns / 1_000_000_000).toFixed(2)}s`;
}

function getDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

export default function TimelinePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const eventsRef = useRef<KernelEvent[]>([]);
  const initialized = useRef(false);

  if (!initialized.current) {
    eventsRef.current = Array.from({ length: 80 }, generateEvent);
    initialized.current = true;
  }

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const [timeWindow, setTimeWindow] = useState<TimeWindow>(5);
  const timeWindowRef = useRef<TimeWindow>(5);
  timeWindowRef.current = timeWindow;

  const zoomRef = useRef({ viewNs: 5_000_000_000, offsetNs: 0 });
  const [zoomLabel, setZoomLabel] = useState("5s");

  const [selectedEvent, setSelectedEvent] = useState<KernelEvent | null>(null);
  const selectedRef = useRef<KernelEvent | null>(null);
  selectedRef.current = selectedEvent;

  const [activeTypes, setActiveTypes] = useState<Set<EventType>>(
    new Set(EVENT_TYPES),
  );
  const activeTypesRef = useRef<Set<EventType>>(new Set(EVENT_TYPES));
  activeTypesRef.current = activeTypes;

  const dimsRef = useRef({ w: 1200, h: 400 });
  const themeSwitchingRef = useRef(false);

  const getVisRange = useCallback((events: KernelEvent[]) => {
    const latestNs = events[events.length - 1].timestampNs;
    const tw = timeWindowRef.current;
    let rangeEndNs = latestNs + 100_000_000;
    const rangeStartNs =
      tw === 0 ? events[0].timestampNs : rangeEndNs - tw * 1_000_000_000;
    const { viewNs, offsetNs } = zoomRef.current;
    rangeEndNs = rangeEndNs - offsetNs;
    return {
      visStartNs: rangeEndNs - viewNs,
      visEndNs: rangeEndNs,
      visRangeNs: viewNs,
      latestNs,
      rangeStartNs,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = getDpr();
    const { w, h } = dimsRef.current;
    const cssW = w;
    const totalLaneH = RULER_H + SERVICES.length * LANE_H;
    const cssH = Math.max(totalLaneH, h);

    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.scale(dpr, dpr);
    }

    const events = eventsRef.current.filter((e) =>
      activeTypesRef.current.has(e.type),
    );

    ctx.clearRect(0, 0, cssW, cssH);

    if (events.length === 0) return;

    const { visStartNs, visEndNs, visRangeNs, latestNs } = getVisRange(events);
    const plotW = cssW - LANE_LABEL_W;

    function nsToX(ns: number): number {
      return LANE_LABEL_W + ((ns - visStartNs) / visRangeNs) * plotW;
    }

    const visEvents = events.filter(
      (e) =>
        e.timestampNs >= visStartNs - 5_000_000 &&
        e.timestampNs <= visEndNs + 5_000_000,
    );

    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => cs.getPropertyValue(name).trim();

    const bgColor = v("--bg");
    const rulerBg = v("--bg-subtle");
    const rulerBorder = v("--border-subtle");
    const tickColor = v("--border");
    const gridColor = v("--border-subtle");
    const tickLabelColor = v("--text-muted");
    const nowLineColor = "rgba(245,158,11,0.45)";
    const laneEvenBg = v("--bg");
    const laneOddBg = v("--bg-subtle");
    const laneSep = v("--border-subtle");
    const labelBg = v("--bg-subtle");
    const labelSep = v("--border");
    const labelColor = v("--text-secondary");
    const correlColor = v("--accent-dim");

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.fillStyle = rulerBg;
    ctx.fillRect(0, 0, cssW, RULER_H);
    ctx.strokeStyle = rulerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LANE_LABEL_W, RULER_H);
    ctx.lineTo(cssW, RULER_H);
    ctx.stroke();

    const targetTicks = 8;
    const rawTickNs = visRangeNs / targetTicks;
    const tickMags = [
      1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000,
      10_000_000_000,
    ];
    let tickNs = tickMags[0];
    for (const m of tickMags) {
      tickNs = m;
      if (rawTickNs <= m) break;
    }

    const firstTick = Math.ceil(visStartNs / tickNs) * tickNs;
    ctx.font = "600 9px monospace";
    ctx.textAlign = "center";

    for (let t = firstTick; t <= visEndNs; t += tickNs) {
      const x = nsToX(t);
      if (x < LANE_LABEL_W || x > cssW) continue;
      ctx.strokeStyle = tickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 6);
      ctx.lineTo(x, RULER_H);
      ctx.stroke();
      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, cssH);
      ctx.stroke();
      ctx.fillStyle = tickLabelColor;
      ctx.fillText(fmtNs(t - events[0].timestampNs), x, RULER_H - 9);
    }

    const nowX = nsToX(latestNs);
    if (nowX > LANE_LABEL_W && nowX < cssW) {
      ctx.strokeStyle = nowLineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(nowX, RULER_H);
      ctx.lineTo(nowX, cssH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    SERVICES.forEach((_, i) => {
      const y = RULER_H + i * LANE_H;
      ctx.fillStyle = i % 2 === 0 ? laneEvenBg : laneOddBg;
      ctx.fillRect(LANE_LABEL_W, y, plotW, LANE_H);
      ctx.strokeStyle = laneSep;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + LANE_H);
      ctx.lineTo(cssW, y + LANE_H);
      ctx.stroke();
    });

    SERVICES.forEach((svc, i) => {
      const y = RULER_H + i * LANE_H;
      ctx.fillStyle = labelBg;
      ctx.fillRect(0, y, LANE_LABEL_W, LANE_H);
      ctx.font = "600 10px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = labelColor;
      ctx.fillText(svc, 12, y + LANE_H / 2 + 4);
      ctx.strokeStyle = labelSep;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LANE_LABEL_W, y);
      ctx.lineTo(LANE_LABEL_W, y + LANE_H);
      ctx.stroke();
    });

    const pidGroups = new Map<number, KernelEvent[]>();
    for (const e of visEvents) {
      if (!pidGroups.has(e.pid)) pidGroups.set(e.pid, []);
      pidGroups.get(e.pid)!.push(e);
    }

    ctx.save();
    ctx.strokeStyle = correlColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    for (const [, evts] of pidGroups) {
      if (evts.length < 2) continue;
      const sorted = [...evts].sort((a, b) => a.timestampNs - b.timestampNs);
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (b.timestampNs - a.timestampNs > CAUSAL_WINDOW_NS) continue;
        if (a.service === b.service) continue;
        const ax = nsToX(a.timestampNs);
        const bx = nsToX(b.timestampNs);
        const si = SERVICES.indexOf(a.service as (typeof SERVICES)[number]);
        const di = SERVICES.indexOf(b.service as (typeof SERVICES)[number]);
        if (si < 0 || di < 0) continue;
        const ay = RULER_H + si * LANE_H + LANE_H / 2;
        const by = RULER_H + di * LANE_H + LANE_H / 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.bezierCurveTo(
          ax + (bx - ax) * 0.4,
          ay,
          bx - (bx - ax) * 0.4,
          by,
          bx,
          by,
        );
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
    ctx.restore();

    const selected = selectedRef.current;

    for (const e of visEvents) {
      const si = SERVICES.indexOf(e.service as (typeof SERVICES)[number]);
      if (si < 0) continue;
      const x = nsToX(e.timestampNs);
      if (x > cssW + 20 || x < LANE_LABEL_W - 20) continue;

      const y = RULER_H + si * LANE_H + BAR_Y_OFFSET;
      const durNs = e.durationUs ? e.durationUs * 1000 : 600_000;
      const barW = Math.max(MIN_BAR_W, (durNs / visRangeNs) * plotW);
      const slow = isSlow(e.durationUs);
      const isSelected = selected?.id === e.id;
      const dimmed = selected && !isSelected;
      const c = TYPE_COLORS[e.type];

      ctx.globalAlpha = dimmed ? 0.18 : 1;
      ctx.fillStyle = slow ? "rgba(245,158,11,0.88)" : c.canvas;

      ctx.beginPath();
      ctx.rect(x, y, barW, BAR_H);
      ctx.fill();

      ctx.strokeStyle = isSelected
        ? "rgba(255,255,255,0.9)"
        : slow
          ? "rgba(245,158,11,1)"
          : c.border;
      ctx.lineWidth = isSelected ? 1.5 : 0.6;
      ctx.stroke();

      if (barW > 30) {
        ctx.globalAlpha = dimmed ? 0.12 : 0.9;
        ctx.font = "600 7px monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = v("--text-primary");
        ctx.fillText(TYPE_SHORT[e.type], x + 4, y + BAR_H / 2 + 3);
      }

      ctx.globalAlpha = 1;

      if (isSelected) {
        ctx.strokeStyle = "rgba(245,158,11,1)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x - 2, y - 2, barW + 4, BAR_H + 4);
        ctx.stroke();
      }
    }
  }, [getVisRange]);

  useEffect(() => {
    draw();
  }, [selectedEvent, activeTypes, timeWindow, draw]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedEvent(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      if (pausedRef.current) return;
      if (themeSwitchingRef.current) return;
      const batch = Array.from(
        { length: Math.floor(Math.random() * 3) + 1 },
        generateEvent,
      );
      eventsRef.current = [...eventsRef.current, ...batch].slice(-MAX_EVENTS);
      draw();
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [draw]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        dimsRef.current = { w: Math.floor(width), h: Math.floor(height) };
        draw();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      draw();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [draw]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const next = Math.min(
        120_000_000_000,
        Math.max(500_000, zoomRef.current.viewNs * factor),
      );
      zoomRef.current = { ...zoomRef.current, viewNs: next };
      setZoomLabel(fmtNs(next));
      draw();
    },
    [draw],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = getDpr();
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / dpr / rect.width);
      const my = (e.clientY - rect.top) * (canvas.height / dpr / rect.height);

      if (mx < LANE_LABEL_W) {
        setSelectedEvent(null);
        return;
      }

      const events = eventsRef.current.filter((ev) =>
        activeTypesRef.current.has(ev.type),
      );
      if (events.length === 0) return;

      const { visStartNs, visRangeNs } = getVisRange(events);
      const plotW = dimsRef.current.w - LANE_LABEL_W;

      const clickNs = visStartNs + ((mx - LANE_LABEL_W) / plotW) * visRangeNs;
      const laneIdx = Math.floor((my - RULER_H) / LANE_H);
      if (laneIdx < 0 || laneIdx >= SERVICES.length) {
        setSelectedEvent(null);
        return;
      }
      const clickSvc = SERVICES[laneIdx];

      let best: KernelEvent | null = null;
      let bestDist = Infinity;

      for (const ev of events) {
        if (ev.service !== clickSvc) continue;
        const durNs = ev.durationUs ? ev.durationUs * 1000 : 600_000;
        if (
          clickNs >= ev.timestampNs - 300_000 &&
          clickNs <= ev.timestampNs + durNs + 300_000
        ) {
          const dist = Math.abs(ev.timestampNs - clickNs);
          if (dist < bestDist) {
            bestDist = dist;
            best = ev;
          }
        }
      }

      setSelectedEvent((prev) => (best && prev?.id !== best.id ? best : null));
    },
    [getVisRange],
  );

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
                <span
                  style={{
                    ...s.pillDot,
                    backgroundColor: on ? c.text : "var(--text-muted)",
                  }}
                />
                {TYPE_SHORT[t]}
              </button>
            );
          })}
        </div>
        <div style={s.tlRight}>
          <div style={s.segGroup}>
            {([1, 5, 30, 0] as TimeWindow[]).map((w) => (
              <button
                key={w}
                onClick={() => {
                  setTimeWindow(w);
                  const ns = (w || 30) * 1_000_000_000;
                  zoomRef.current = { viewNs: ns, offsetNs: 0 };
                  setZoomLabel(fmtNs(ns));
                }}
                style={{
                  ...s.seg,
                  ...(timeWindow === w ? s.segOn : {}),
                }}
              >
                {w === 0 ? "all" : `${w}s`}
              </button>
            ))}
          </div>
          <div style={s.divider} />
          <span style={s.zoomLabel}>{zoomLabel}</span>
          <div style={s.divider} />
          <button
            style={{ ...s.ctrlBtn, ...(paused ? s.ctrlBtnOn : {}) }}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? "resume" : "live"}
          </button>
          <button
            style={s.ctrlBtn}
            onClick={() => {
              eventsRef.current = [];
              setSelectedEvent(null);
              draw();
            }}
          >
            <ClearIcon /> clear
          </button>
        </div>
      </div>

      <div style={s.legend}>
        <span style={s.legendHint}>scroll to zoom · click bar to inspect</span>
        <div style={s.legendItems}>
          {EVENT_TYPES.map((t) => (
            <div key={t} style={s.legendItem}>
              <span
                style={{
                  ...s.legendDot,
                  backgroundColor: TYPE_COLORS[t].canvas,
                }}
              />
              <span style={s.legendLabel}>{TYPE_SHORT[t]}</span>
            </div>
          ))}
          <div style={s.legendItem}>
            <span
              style={{
                ...s.legendDot,
                backgroundColor: "rgba(245,158,11,0.88)",
              }}
            />
            <span style={s.legendLabel}>slow (&gt;500ms)</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} style={s.canvasWrap}>
        <canvas ref={canvasRef} style={s.canvas} onClick={handleCanvasClick} />
        {eventsRef.current.length === 0 && (
          <div style={s.empty}>
            <span style={s.emptyText}>awaiting kernel events</span>
          </div>
        )}
      </div>

      {selectedEvent && (
        <div style={s.detail}>
          <div style={s.detailHeader}>
            <span style={s.detailType}>{selectedEvent.type}</span>
            <span style={s.detailSep}>·</span>
            <span style={s.detailSvc}>{selectedEvent.service}</span>
            <span style={s.detailTs}>{selectedEvent.timestamp}</span>
            <span style={s.detailDur}>{fmtDur(selectedEvent.durationUs)}</span>
            <button
              style={s.closeBtn}
              onClick={() => setSelectedEvent(null)}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
          <div style={s.detailGrid}>
            <KV k="pid" v={String(selectedEvent.pid)} />
            <KV k="tid" v={String(selectedEvent.tid)} />
            <KV k="cpu" v={String(selectedEvent.cpu)} />
            <KV k="timestamp" v={selectedEvent.timestamp} />
            <KV
              k="duration"
              v={fmtDur(selectedEvent.durationUs)}
              accent={isSlow(selectedEvent.durationUs)}
            />
            <KV k="detail" v={selectedEvent.detail} />
            {Object.entries(selectedEvent.meta).map(([k, v]) => (
              <KV key={k} k={k} v={v} />
            ))}
          </div>
        </div>
      )}
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
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.2rem 0.5rem",
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
  pillDot: { width: 5, height: 5, borderRadius: "0px", flexShrink: 0 },
  segGroup: {
    display: "flex",
    border: "1px solid var(--border)",
    borderRadius: "0px",
    overflow: "hidden",
  },
  seg: {
    padding: "0.2rem 0.55rem",
    fontSize: "0.65rem",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    borderRight: "1px solid var(--border)",
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
  },
  segOn: { backgroundColor: "var(--accent-dim)", color: "var(--accent)" },
  divider: {
    width: "1px",
    height: "14px",
    backgroundColor: "var(--border-subtle)",
  },
  zoomLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
    minWidth: "32px",
    textAlign: "center" as const,
  },
  ctrlBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.25rem 0.625rem",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "0px",
    color: "var(--text-muted)",
    fontSize: "0.68rem",
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
  legend: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 1.25rem",
    height: "32px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    backgroundColor: "var(--bg)",
  },
  legendHint: {
    fontSize: "0.6rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
    opacity: 0.6,
    letterSpacing: "0.04em",
  },
  legendItems: { display: "flex", alignItems: "center", gap: "1rem" },
  legendItem: { display: "flex", alignItems: "center", gap: "0.3rem" },
  legendDot: { width: 8, height: 8, borderRadius: "0px", flexShrink: 0 },
  legendLabel: {
    fontSize: "0.6rem",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
  },
  canvasWrap: {
    flex: 1,
    position: "relative",
    overflow: "auto",
    overflowX: "hidden",
  },
  canvas: { display: "block", cursor: "crosshair" },
  empty: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  emptyText: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    color: "var(--text-muted)",
    opacity: 0.35,
    letterSpacing: "0.08em",
  },
  detail: {
    flexShrink: 0,
    borderTop: "1px solid var(--border-subtle)",
    backgroundColor: "var(--bg-subtle)",
    padding: "0.75rem 1.25rem",
    maxHeight: "180px",
    overflowY: "auto" as const,
  },
  detailHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.625rem",
  },
  detailType: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.68rem",
    fontWeight: 700,
    color: "var(--accent)",
    letterSpacing: "0.04em",
  },
  detailSep: { color: "var(--border)", fontSize: "0.7rem" },
  detailSvc: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-secondary)",
    flex: 1,
  },
  detailTs: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.6rem",
    color: "var(--text-muted)",
  },
  detailDur: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    color: "var(--accent)",
    fontWeight: 700,
  },
  closeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-subtle)",
    borderRadius: "0px",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 0,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto 1fr",
    gap: "0.2rem 1.25rem",
    alignItems: "baseline",
  },
};
