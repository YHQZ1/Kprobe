import { useState, useEffect, useRef, useCallback } from "react";
import type { EventType } from "../types/events";
import { fmtDur } from "../lib/mockData";
import {
  PassIcon,
  FailIcon,
  PlayIcon,
  PauseIcon,
  ResetIcon,
  StepBackIcon,
  StepFwdIcon,
} from "../components/ui/icons";

interface ReplayEvent {
  id: string;
  offsetMs: number;
  type: EventType;
  pid: number;
  service: string;
  detail: string;
  duration: number | null;
  isKeyEvent: boolean;
  keyLabel?: string;
}

interface Incident {
  id: string;
  name: string;
  ts: string;
  transactionId: string;
  rootCause: string;
  durationMs: number;
  events: ReplayEvent[];
  originalOutcome: "FAILED" | "PASSED";
  fixTimeoutMs: number;
}

interface Injections {
  timeoutMs: number;
  networkLatencyMs: number;
  memoryPressure: boolean;
  cpuThrottle: number;
}

function mkEvt(
  id: string,
  offsetMs: number,
  type: EventType,
  pid: number,
  service: string,
  detail: string,
  duration: number | null,
  isKeyEvent = false,
  keyLabel?: string,
): ReplayEvent {
  return {
    id,
    offsetMs,
    type,
    pid,
    service,
    detail,
    duration,
    isKeyEvent,
    keyLabel,
  };
}

const INCIDENTS: Incident[] = [
  {
    id: "inc-001",
    name: "Settlement timeout — payment #98721",
    ts: "2026-05-08 02:47:13",
    transactionId: "#98721",
    rootCause:
      "Memory pressure from batch-job caused 800ms ledger write delay, exceeding 750ms payment-handler timeout",
    durationMs: 1240,
    fixTimeoutMs: 1500,
    originalOutcome: "FAILED",
    events: [
      mkEvt(
        "e1",
        0,
        "tcp_recvmsg",
        4821,
        "payment-handler",
        "payment-handler ← inbound · 2.1kb",
        120,
        true,
        "Payment #98721 received",
      ),
      mkEvt(
        "e2",
        4,
        "tcp_sendmsg",
        4821,
        "payment-handler",
        "payment-handler → risk-engine · 1.4kb",
        80,
      ),
      mkEvt(
        "e3",
        18,
        "tcp_recvmsg",
        5103,
        "risk-engine",
        "risk-engine ← inbound · 1.4kb",
        95,
      ),
      mkEvt(
        "e4",
        45,
        "tcp_sendmsg",
        5103,
        "risk-engine",
        "risk-engine → payment-handler · 0.8kb",
        60,
        true,
        "Risk check passed",
      ),
      mkEvt(
        "e5",
        62,
        "tcp_recvmsg",
        4821,
        "payment-handler",
        "payment-handler ← risk-engine · 0.8kb",
        55,
      ),
      mkEvt(
        "e6",
        80,
        "sys_write",
        4821,
        "payment-handler",
        "fd=7 · settlement write initiated",
        null,
        true,
        "Settlement write initiated",
      ),
      mkEvt(
        "e7",
        82,
        "mm_page_fault",
        4721,
        "batch-job",
        "addr=0x7fff3a2b1c00 · memory pressure",
        1800,
        true,
        "Memory pressure (batch-job PID 4721)",
      ),
      mkEvt(
        "e8",
        85,
        "sched_switch",
        4821,
        "payment-handler",
        "preempted · CPU 3 → PID 4721 · 800ms",
        800000,
        true,
        "payment-handler preempted",
      ),
      mkEvt(
        "e9",
        112,
        "sys_write",
        4721,
        "batch-job",
        "fd=4 · index update",
        420,
      ),
      mkEvt("e10", 340, "sys_read", 4721, "batch-job", "fd=4 · page read", 280),
      mkEvt(
        "e11",
        880,
        "sched_switch",
        4821,
        "payment-handler",
        "resumed · CPU 3 · after 800ms",
        null,
        true,
        "payment-handler resumed",
      ),
      mkEvt(
        "e12",
        882,
        "sys_write",
        4821,
        "payment-handler",
        "fd=7 · settlement write completed",
        950000,
        true,
        "Ledger write complete (950ms total)",
      ),
      mkEvt(
        "e13",
        830,
        "tcp_sendmsg",
        4821,
        "payment-handler",
        "payment-handler → settlement-svc · timeout signal",
        null,
        true,
        "Timeout exceeded (750ms threshold)",
      ),
      mkEvt(
        "e14",
        835,
        "tcp_sendmsg",
        4821,
        "payment-handler",
        "payment-handler → client · payment failed",
        null,
        true,
        "Payment failed — money in limbo",
      ),
    ],
  },
  {
    id: "inc-002",
    name: "Order book stall — order #44102",
    ts: "2026-05-06 14:22:07",
    transactionId: "#44102",
    rootCause:
      "TCP retransmit on order-router → settlement-svc pushed order past clearing window",
    durationMs: 980,
    fixTimeoutMs: 2000,
    originalOutcome: "FAILED",
    events: [
      mkEvt(
        "f1",
        0,
        "tcp_recvmsg",
        7201,
        "order-router",
        "order-router ← inbound · 3.2kb",
        90,
        true,
        "Order #44102 received",
      ),
      mkEvt(
        "f2",
        12,
        "sys_read",
        7201,
        "order-router",
        "fd=5 · order book snapshot fetch",
        180,
      ),
      mkEvt(
        "f3",
        55,
        "tcp_sendmsg",
        7201,
        "order-router",
        "order-router → settlement-svc · 4.1kb",
        null,
        true,
        "Route to settlement",
      ),
      mkEvt(
        "f4",
        58,
        "sched_switch",
        7201,
        "order-router",
        "preempted · CPU 1 → PID 9012 · 420ms",
        420000,
        true,
        "CPU preempt on order-router",
      ),
      mkEvt(
        "f5",
        480,
        "tcp_sendmsg",
        7201,
        "order-router",
        "order-router → settlement-svc · retransmit",
        null,
        true,
        "TCP retransmit",
      ),
      mkEvt(
        "f6",
        485,
        "tcp_recvmsg",
        8830,
        "settlement-svc",
        "settlement-svc ← inbound · 4.1kb",
        110,
      ),
      mkEvt(
        "f7",
        510,
        "sys_write",
        8830,
        "settlement-svc",
        "fd=9 · ledger write",
        340000,
      ),
      mkEvt(
        "f8",
        855,
        "tcp_sendmsg",
        8830,
        "settlement-svc",
        "settlement-svc → ledger-writer · clearing window missed",
        null,
        true,
        "Clearing window exceeded",
      ),
    ],
  },
  {
    id: "inc-003",
    name: "Ledger write collision — txn #21983",
    ts: "2026-05-04 09:11:44",
    transactionId: "#21983",
    rootCause:
      "Concurrent sys_write from two ledger-writer threads caused page fault cascade",
    durationMs: 640,
    fixTimeoutMs: 1000,
    originalOutcome: "FAILED",
    events: [
      mkEvt(
        "g1",
        0,
        "tcp_recvmsg",
        6601,
        "ledger-writer",
        "ledger-writer ← inbound · 1.8kb",
        70,
        true,
        "Txn #21983 write request",
      ),
      mkEvt(
        "g2",
        8,
        "sys_write",
        6601,
        "ledger-writer",
        "fd=11 · WAL append — thread A",
        null,
        true,
        "Thread A WAL write begins",
      ),
      mkEvt(
        "g3",
        9,
        "sys_write",
        6602,
        "ledger-writer",
        "fd=11 · WAL append — thread B (concurrent)",
        null,
        true,
        "Thread B concurrent write",
      ),
      mkEvt(
        "g4",
        11,
        "mm_page_fault",
        6601,
        "ledger-writer",
        "addr=0x7ffe00a12400 · major fault",
        1200,
        true,
        "Page fault cascade begins",
      ),
      mkEvt(
        "g5",
        14,
        "mm_page_fault",
        6602,
        "ledger-writer",
        "addr=0x7ffe00a12800 · major fault",
        1100,
      ),
      mkEvt(
        "g6",
        180,
        "sched_switch",
        6601,
        "ledger-writer",
        "preempted · CPU 5 · 280ms",
        280000,
      ),
      mkEvt(
        "g7",
        460,
        "sys_write",
        6601,
        "ledger-writer",
        "fd=11 · WAL append complete",
        580000,
        true,
        "Thread A write complete",
      ),
      mkEvt(
        "g8",
        465,
        "sys_write",
        6602,
        "ledger-writer",
        "fd=11 · WAL append — duplicate entry detected",
        null,
        true,
        "Duplicate write — txn rolled back",
      ),
    ],
  },
];

const TYPE_LABELS: Record<string, string> = {
  tcp_sendmsg: "tcp_send",
  tcp_recvmsg: "tcp_recv",
  sys_write: "sys_write",
  sys_read: "sys_read",
  sched_switch: "sched",
  mm_page_fault: "page_fault",
};

const SPEEDS = [0.1, 0.5, 1, 2, 5, 10];

function outcomeFlips(incident: Incident, inj: Injections): boolean {
  return (
    inj.timeoutMs >= incident.fixTimeoutMs &&
    !inj.memoryPressure &&
    inj.networkLatencyMs < 200
  );
}

export default function ReplayPage() {
  const [selectedIncident, setSelectedIncident] = useState<Incident>(
    INCIDENTS[0],
  );
  const [injections, setInjections] = useState<Injections>({
    timeoutMs: 750,
    networkLatencyMs: 0,
    memoryPressure: false,
    cpuThrottle: 0,
  });

  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);

  const playingRef = useRef(false);
  playingRef.current = playing;
  const playheadRef = useRef(0);
  playheadRef.current = playheadMs;
  const speedRef = useRef(SPEEDS[2]);
  speedRef.current = SPEEDS[speedIdx];
  const incidentRef = useRef(selectedIncident);
  incidentRef.current = selectedIncident;

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const outcome = outcomeFlips(selectedIncident, injections)
    ? "PASSED"
    : selectedIncident.originalOutcome;

  const isModified =
    injections.timeoutMs !== 750 ||
    injections.networkLatencyMs !== 0 ||
    injections.memoryPressure !== false ||
    injections.cpuThrottle !== 0;

  const visibleEvents = selectedIncident.events.filter(
    (e) => e.offsetMs <= playheadMs,
  );

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleCount]);

  const tick = useCallback((now: number) => {
    if (!playingRef.current) return;
    if (lastTsRef.current === null) lastTsRef.current = now;
    const elapsed = (now - lastTsRef.current) * speedRef.current;
    lastTsRef.current = now;

    const next = Math.min(
      playheadRef.current + elapsed,
      incidentRef.current.durationMs,
    );
    setPlayheadMs(next);
    setVisibleCount(
      incidentRef.current.events.filter((e) => e.offsetMs <= next).length,
    );

    if (next >= incidentRef.current.durationMs) {
      setPlaying(false);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (playing) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, tick]);

  function handleSelectIncident(inc: Incident) {
    setSelectedIncident(inc);
    setPlaying(false);
    setPlayheadMs(0);
    setVisibleCount(0);
    setInjections({
      timeoutMs: 750,
      networkLatencyMs: 0,
      memoryPressure: false,
      cpuThrottle: 0,
    });
  }

  function handlePlay() {
    if (playheadMs >= selectedIncident.durationMs) {
      setPlayheadMs(0);
      setVisibleCount(0);
    }
    setPlaying(true);
  }

  function handlePause() {
    setPlaying(false);
  }

  function handleStep(dir: 1 | -1) {
    setPlaying(false);
    const evts = selectedIncident.events;
    const cur = visibleEvents.length;
    const target = Math.max(
      0,
      Math.min(evts.length - 1, cur + dir - (dir === -1 ? 1 : 0)),
    );
    const newMs =
      evts[target]?.offsetMs ?? (dir === 1 ? selectedIncident.durationMs : 0);
    setPlayheadMs(newMs);
    setVisibleCount(evts.filter((e) => e.offsetMs <= newMs).length);
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    setPlaying(false);
    const ms = Number(e.target.value);
    setPlayheadMs(ms);
    setVisibleCount(
      selectedIncident.events.filter((ev) => ev.offsetMs <= ms).length,
    );
  }

  function handleReset() {
    setPlaying(false);
    setPlayheadMs(0);
    setVisibleCount(0);
  }

  const progressPct = (playheadMs / selectedIncident.durationMs) * 100;

  return (
    <div style={s.root}>
      <style>{`
        .inj-slider {
          width: 100%;
          accent-color: var(--text-secondary);
          cursor: pointer;
        }
        .toggle-btn {
          padding: 0.2rem 0.6rem;
          border-radius: 0px;
          border: 1px solid var(--border);
          background-color: transparent;
          color: var(--text-muted);
          font-size: 0.63rem;
          font-family: var(--font-mono);
          font-weight: 600;
          cursor: pointer;
          transition: all 0ms ease;
        }
        .toggle-btn.on {
          background-color: var(--bg-elevated);
          border-color: var(--border-subtle);
          color: var(--text-primary);
        }
        .incident-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.75rem;
          border-radius: 0px;
          border: 1px solid var(--border-subtle);
          background-color: transparent;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0ms ease;
        }
        .incident-btn:hover {
          background-color: var(--bg-elevated);
        }
        .incident-btn.on {
          background-color: var(--bg-elevated);
          border-color: var(--border);
        }
        .ctrl-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.625rem;
          background-color: transparent;
          border: 1px solid var(--border);
          border-radius: 0px;
          color: var(--text-muted);
          font-size: 0.68rem;
          font-family: var(--font);
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all 0ms ease;
        }
        .ctrl-btn:hover:not(.primary) {
          background-color: var(--bg-elevated);
        }
        .ctrl-btn.primary {
          background-color: var(--accent-dim);
          border-color: var(--border);
          color: var(--accent);
        }
        .speed-btn {
          padding: 0.2rem 0.45rem;
          font-size: 0.62rem;
          font-family: var(--font-mono);
          font-weight: 600;
          cursor: pointer;
          border: none;
          border-right: 1px solid var(--border);
          background-color: transparent;
          color: var(--text-muted);
          letter-spacing: 0.02em;
          transition: all 0ms ease;
        }
        .speed-btn:hover {
          background-color: var(--bg-elevated);
        }
        .speed-btn.on {
          background-color: var(--bg-elevated);
          color: var(--text-primary);
        }
        .log-row {
          transition: background-color 0ms ease, border-color 0ms ease;
        }
      `}</style>

      <div style={s.incidentBar}>
        <span style={s.incidentBarLabel}>incident</span>
        {INCIDENTS.map((inc) => (
          <button
            key={inc.id}
            onClick={() => handleSelectIncident(inc)}
            className={`incident-btn ${selectedIncident.id === inc.id ? "on" : ""}`}
          >
            <span style={s.incidentBtnId}>{inc.transactionId}</span>
            <span style={s.incidentBtnName}>
              {inc.name.split("—")[0].trim()}
            </span>
            <span
              style={{
                ...s.outcomeDot,
                backgroundColor:
                  inc.originalOutcome === "FAILED"
                    ? "var(--text-muted)"
                    : "var(--border)",
              }}
            />
          </button>
        ))}
      </div>

      <div style={s.body}>
        <div style={s.injPanel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>injections</span>
            {isModified && (
              <button
                style={s.resetInjBtn}
                onClick={() =>
                  setInjections({
                    timeoutMs: 750,
                    networkLatencyMs: 0,
                    memoryPressure: false,
                    cpuThrottle: 0,
                  })
                }
              >
                reset
              </button>
            )}
          </div>

          <div style={s.injSection}>
            <InjLabel
              label="timeout threshold"
              value={`${injections.timeoutMs}ms`}
            />
            <input
              type="range"
              min={100}
              max={3000}
              step={50}
              value={injections.timeoutMs}
              onChange={(e) =>
                setInjections((p) => ({
                  ...p,
                  timeoutMs: Number(e.target.value),
                }))
              }
              className="inj-slider"
            />
            <div style={s.sliderHints}>
              <span>100ms</span>
              <span>3000ms</span>
            </div>
          </div>

          <div style={s.injDivider} />

          <div style={s.injSection}>
            <InjLabel
              label="network latency"
              value={`+${injections.networkLatencyMs}ms`}
            />
            <input
              type="range"
              min={0}
              max={500}
              step={5}
              value={injections.networkLatencyMs}
              onChange={(e) =>
                setInjections((p) => ({
                  ...p,
                  networkLatencyMs: Number(e.target.value),
                }))
              }
              className="inj-slider"
            />
            <div style={s.sliderHints}>
              <span>0ms</span>
              <span>500ms</span>
            </div>
          </div>

          <div style={s.injDivider} />

          <div style={s.injSection}>
            <InjLabel
              label="CPU throttle"
              value={`${injections.cpuThrottle}%`}
            />
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={injections.cpuThrottle}
              onChange={(e) =>
                setInjections((p) => ({
                  ...p,
                  cpuThrottle: Number(e.target.value),
                }))
              }
              className="inj-slider"
            />
            <div style={s.sliderHints}>
              <span>0%</span>
              <span>90%</span>
            </div>
          </div>

          <div style={s.injDivider} />

          <div style={s.injSection}>
            <div style={s.toggleRow}>
              <InjLabel
                label="memory pressure"
                value={injections.memoryPressure ? "ON" : "OFF"}
              />
              <button
                onClick={() =>
                  setInjections((p) => ({
                    ...p,
                    memoryPressure: !p.memoryPressure,
                  }))
                }
                className={`toggle-btn ${injections.memoryPressure ? "on" : ""}`}
              >
                {injections.memoryPressure ? "on" : "off"}
              </button>
            </div>
          </div>

          <div style={s.injDivider} />

          <div style={s.rootCauseBox}>
            <span style={s.rootCauseLabel}>root cause</span>
            <span style={s.rootCauseText}>{selectedIncident.rootCause}</span>
          </div>

          {outcome === "FAILED" && (
            <div style={s.hintBox}>
              <span style={s.hintText}>
                Adjust injections to address root cause and verify resolution
              </span>
            </div>
          )}
        </div>

        <div style={s.playPanel}>
          <div style={s.outcomeRow}>
            <div style={s.incidentMeta}>
              <span style={s.metaId}>{selectedIncident.transactionId}</span>
              <span style={s.metaSep}>·</span>
              <span style={s.metaTs}>{selectedIncident.ts}</span>
              <span style={s.metaSep}>·</span>
              <span style={s.metaDur}>
                {selectedIncident.durationMs}ms window
              </span>
            </div>
            <div
              style={{
                ...s.outcomeBadge,
                ...(outcome === "PASSED" ? s.outcomePassed : s.outcomeFailed),
              }}
            >
              {outcome === "PASSED" ? <PassIcon /> : <FailIcon />}
              {outcome}
            </div>
          </div>

          <div style={s.scrubberWrap}>
            <div style={s.scrubberTrack}>
              <div style={s.scrubRail} />
              {selectedIncident.events
                .filter((e) => e.isKeyEvent)
                .map((e) => (
                  <div
                    key={e.id}
                    title={e.keyLabel}
                    style={{
                      ...s.scrubMarker,
                      left: `${(e.offsetMs / selectedIncident.durationMs) * 100}%`,
                    }}
                  />
                ))}
              <div style={{ ...s.scrubFill, width: `${progressPct}%` }} />
              <input
                type="range"
                min={0}
                max={selectedIncident.durationMs}
                step={1}
                value={playheadMs}
                onChange={handleScrub}
                style={s.scrubInput}
              />
            </div>
            <div style={s.scrubTime}>
              <span style={s.scrubTs}>{playheadMs.toFixed(0)}ms</span>
              <span style={s.scrubTotal}>
                / {selectedIncident.durationMs}ms
              </span>
            </div>
          </div>

          <div style={s.controls}>
            <div style={s.ctrlLeft}>
              <button className="ctrl-btn" onClick={handleReset} title="reset">
                <ResetIcon />
              </button>
              <button
                className="ctrl-btn"
                onClick={() => handleStep(-1)}
                title="step back"
              >
                <StepBackIcon />
              </button>
              {playing ? (
                <button className="ctrl-btn primary" onClick={handlePause}>
                  <PauseIcon /> pause
                </button>
              ) : (
                <button className="ctrl-btn primary" onClick={handlePlay}>
                  <PlayIcon />{" "}
                  {playheadMs >= selectedIncident.durationMs
                    ? "replay"
                    : "play"}
                </button>
              )}
              <button
                className="ctrl-btn"
                onClick={() => handleStep(1)}
                title="step forward"
              >
                <StepFwdIcon />
              </button>
            </div>
            <div style={s.ctrlRight}>
              <span style={s.speedLabel}>speed</span>
              <div style={s.speedGroup}>
                {SPEEDS.map((sp, i) => (
                  <button
                    key={sp}
                    onClick={() => setSpeedIdx(i)}
                    className={`speed-btn ${speedIdx === i ? "on" : ""}`}
                  >
                    {sp}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={s.keyEventList}>
            {selectedIncident.events
              .filter((e) => e.isKeyEvent)
              .map((e) => {
                const reached = e.offsetMs <= playheadMs;
                return (
                  <div
                    key={e.id}
                    style={{ ...s.keyEventRow, opacity: reached ? 1 : 0.4 }}
                  >
                    <div
                      style={{
                        ...s.keyEventDot,
                        backgroundColor: reached
                          ? "var(--text-primary)"
                          : "var(--border)",
                      }}
                    />
                    <span style={s.keyEventOffset}>{e.offsetMs}ms</span>
                    <span
                      style={{
                        ...s.keyEventLabel,
                        color: reached
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      }}
                    >
                      {e.keyLabel}
                    </span>
                  </div>
                );
              })}
          </div>

          <div style={s.logHeader}>
            <span style={s.logTitle}>event log</span>
            <span style={s.logCount}>
              {visibleEvents.length} / {selectedIncident.events.length}
            </span>
          </div>
          <div ref={logRef} style={s.logBody}>
            {visibleEvents.map((evt, idx) => {
              return (
                <div
                  key={evt.id}
                  className="log-row"
                  style={{
                    ...s.logRow,
                    backgroundColor:
                      idx % 2 === 0 ? "var(--bg)" : "var(--bg-subtle)",
                    borderLeft: evt.isKeyEvent
                      ? "2px solid var(--border-subtle)"
                      : "2px solid transparent",
                  }}
                >
                  <span style={s.logOffset}>{evt.offsetMs}ms</span>
                  <span style={s.logBadge}>{TYPE_LABELS[evt.type]}</span>
                  <span style={s.logSvc}>{evt.service}</span>
                  <span style={s.logDetail}>{evt.detail}</span>
                  <span style={s.logDur}>{fmtDur(evt.duration)}</span>
                </div>
              );
            })}
            {visibleEvents.length === 0 && (
              <div style={s.logEmpty}>press play to begin replay</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InjLabel({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: "0.4rem",
      }}
    >
      <span
        style={{
          fontSize: "0.6rem",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "0.7rem",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          color: "var(--text-secondary)",
        }}
      >
        {value}
      </span>
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
  incidentBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0 1.25rem",
    height: "44px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    backgroundColor: "var(--bg-subtle)",
    overflowX: "auto",
  },
  incidentBarLabel: {
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
    marginRight: "0.25rem",
    flexShrink: 0,
  },
  incidentBtnId: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  incidentBtnName: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
  },
  outcomeDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  body: { display: "flex", flex: 1, overflow: "hidden" },
  injPanel: {
    width: "240px",
    flexShrink: 0,
    borderRight: "1px solid var(--border-subtle)",
    padding: "1rem",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column",
    gap: 0,
    backgroundColor: "var(--bg-subtle)",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1rem",
  },
  panelTitle: {
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  },
  resetInjBtn: {
    fontSize: "0.6rem",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "transparent",
    border: "1px solid var(--border-subtle)",
    borderRadius: "0px",
    padding: "0.15rem 0.4rem",
    cursor: "pointer",
    letterSpacing: "0.04em",
    transition: "all 0ms ease",
  },
  injSection: { paddingBottom: "0.875rem" },
  injDivider: {
    height: "1px",
    backgroundColor: "var(--border-subtle)",
    marginBottom: "0.875rem",
  },
  sliderHints: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "0.2rem",
    fontSize: "0.55rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
    opacity: 0.6,
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rootCauseBox: {
    marginTop: "0.5rem",
    padding: "0.625rem",
    backgroundColor: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "0px",
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  rootCauseLabel: {
    fontSize: "0.55rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  },
  rootCauseText: {
    fontSize: "0.65rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  },
  hintBox: {
    marginTop: "0.625rem",
    padding: "0.5rem 0.625rem",
    backgroundColor: "var(--bg)",
    border: "1px dashed var(--border)",
    borderRadius: "0px",
  },
  hintText: {
    fontSize: "0.6rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  playPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  },
  outcomeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1.25rem",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  incidentMeta: { display: "flex", alignItems: "center", gap: "0.5rem" },
  metaId: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  metaSep: { color: "var(--border)", fontSize: "0.7rem" },
  metaTs: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
  },
  metaDur: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
  },
  outcomeBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.3rem 0.75rem",
    borderRadius: "0px",
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    border: "1px solid",
  },
  outcomeFailed: {
    backgroundColor: "var(--bg)",
    borderColor: "var(--border-subtle)",
    color: "var(--text-primary)",
  },
  outcomePassed: {
    backgroundColor: "var(--bg-elevated)",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
  },
  scrubberWrap: {
    padding: "0.75rem 1.25rem 0.5rem",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  scrubberTrack: {
    position: "relative",
    height: "16px",
    display: "flex",
    alignItems: "center",
  },
  scrubRail: {
    position: "absolute",
    left: 0,
    right: 0,
    height: "3px",
    backgroundColor: "var(--border)",
    borderRadius: "0px",
    pointerEvents: "none",
  },
  scrubFill: {
    position: "absolute",
    left: 0,
    height: "3px",
    backgroundColor: "var(--text-muted)",
    borderRadius: "0px",
    pointerEvents: "none",
    transition: "background-color 0ms ease",
  },
  scrubMarker: {
    position: "absolute",
    width: "2px",
    height: "10px",
    borderRadius: "0px",
    transform: "translateX(-50%)",
    pointerEvents: "none",
    zIndex: 2,
    backgroundColor: "var(--border-subtle)",
  },
  scrubInput: {
    position: "absolute",
    inset: 0,
    width: "100%",
    opacity: 0,
    cursor: "pointer",
    zIndex: 3,
    margin: 0,
    height: "100%",
  },
  scrubTime: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.3rem",
    marginTop: "0.35rem",
  },
  scrubTs: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  scrubTotal: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 1.25rem",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  ctrlLeft: { display: "flex", alignItems: "center", gap: "0.375rem" },
  ctrlRight: { display: "flex", alignItems: "center", gap: "0.5rem" },
  speedLabel: {
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  },
  speedGroup: {
    display: "flex",
    border: "1px solid var(--border)",
    borderRadius: "0px",
    overflow: "hidden",
  },
  keyEventList: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    padding: "0.5rem 1.25rem",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    overflowX: "auto",
    minHeight: "60px",
  },
  keyEventRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    padding: "0.2rem 0",
    transition: "opacity 0ms ease",
  },
  keyEventDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background-color 0ms ease",
  },
  keyEventOffset: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.6rem",
    color: "var(--text-muted)",
    width: "44px",
    flexShrink: 0,
  },
  keyEventLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    transition: "color 0ms ease",
  },
  logHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.4rem 1.25rem",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    backgroundColor: "var(--bg-subtle)",
  },
  logTitle: {
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  },
  logCount: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.6rem",
    color: "var(--text-muted)",
  },
  logBody: { flex: 1, overflowY: "auto" as const },
  logEmpty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem",
    fontFamily: "var(--font-mono)",
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    opacity: 0.4,
  },
  logRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0 1.25rem",
    height: "32px",
    cursor: "default",
  },
  logOffset: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
    width: "48px",
    flexShrink: 0,
  },
  logBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-mono)",
    fontSize: "0.6rem",
    fontWeight: 600,
    padding: "0.1em 0.4em",
    borderRadius: "0px",
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
    width: "80px",
  },
  logSvc: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    color: "var(--text-secondary)",
    width: "130px",
    flexShrink: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  logDetail: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.68rem",
    color: "var(--text-secondary)",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  logDur: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.62rem",
    color: "var(--text-muted)",
    flexShrink: 0,
    width: "64px",
    textAlign: "right" as const,
  },
};
