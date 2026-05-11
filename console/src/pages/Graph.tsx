import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType =
  | "tcp_sendmsg"
  | "tcp_recvmsg"
  | "sys_write"
  | "sys_read"
  | "sched_switch"
  | "mm_page_fault"
  | "payment"
  | "settlement"
  | "risk_check"
  | "timeout";

type Severity = "normal" | "slow" | "critical" | "root_cause";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: EventType;
  service: string;
  severity: Severity;
  duration: number | null; // µs
  timestamp: string;
  pid: number;
  cpu: number;
  detail: string;
  meta: Record<string, string>;
  // d3 adds x, y, vx, vy, fx, fy
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  label: string;
  delayMs: number;
  causal: boolean; // true = proven causal, false = correlational
}

// ─── Mock incident graph ──────────────────────────────────────────────────────

const MOCK_NODES: GraphNode[] = [
  {
    id: "n1",
    label: "Payment #98721",
    type: "payment",
    service: "payment-handler",
    severity: "critical",
    duration: 812000,
    timestamp: "02:47:11.204",
    pid: 2847,
    cpu: 3,
    detail: "₹50,000 settlement initiated · exceeded 750ms threshold",
    meta: { amount: "₹50,000", threshold_ms: "750", actual_ms: "812" },
  },
  {
    id: "n2",
    label: "Risk Check",
    type: "risk_check",
    service: "risk-engine",
    severity: "normal",
    duration: 12000,
    timestamp: "02:47:11.208",
    pid: 3102,
    cpu: 1,
    detail: "risk check passed · score 0.12",
    meta: { score: "0.12", threshold: "0.80", result: "pass" },
  },
  {
    id: "n3",
    label: "Settlement Write",
    type: "settlement",
    service: "settlement-svc",
    severity: "slow",
    duration: 800000,
    timestamp: "02:47:11.220",
    pid: 2849,
    cpu: 3,
    detail: "ledger write to fd=7 · WAL append · 800ms delayed",
    meta: { fd: "7", bytes: "16384", offset: "8842934" },
  },
  {
    id: "n4",
    label: "sys_write",
    type: "sys_write",
    service: "settlement-svc",
    severity: "slow",
    duration: 800000,
    timestamp: "02:47:11.221",
    pid: 2849,
    cpu: 3,
    detail: "fd=7 · WAL append · blocked on memory reclaim",
    meta: {
      fd: "7",
      bytes: "16384",
      flags: "O_WRONLY|O_APPEND",
      blocked_ms: "800",
    },
  },
  {
    id: "n5",
    label: "mm_page_fault",
    type: "mm_page_fault",
    service: "settlement-svc",
    severity: "root_cause",
    duration: 2100,
    timestamp: "02:47:11.221",
    pid: 2849,
    cpu: 3,
    detail: "addr=0x7f3a8c001000 · major fault · memory pressure",
    meta: {
      address: "0x7f3a8c001000",
      fault_type: "major",
      pgfault: "847",
      vma_flags: "VM_READ|VM_WRITE",
    },
  },
  {
    id: "n6",
    label: "sched_switch",
    type: "sched_switch",
    service: "batch-job",
    severity: "root_cause",
    duration: 800000,
    timestamp: "02:47:11.221",
    pid: 4721,
    cpu: 3,
    detail: "preempted · batch-job PID 4721 competing for RAM · 800ms",
    meta: {
      prev_pid: "2849",
      next_pid: "4721",
      cpu: "3",
      delay_ms: "800",
      prev_state: "TASK_RUNNING",
    },
  },
  {
    id: "n7",
    label: "tcp_sendmsg",
    type: "tcp_sendmsg",
    service: "payment-handler",
    severity: "normal",
    duration: 1200,
    timestamp: "02:47:11.205",
    pid: 2847,
    cpu: 3,
    detail: "payment-handler → settlement-svc · 6.2kb",
    meta: {
      src_port: "54821",
      dst_port: "8080",
      bytes: "6349",
      protocol: "TCP",
    },
  },
  {
    id: "n8",
    label: "Timeout",
    type: "timeout",
    service: "payment-handler",
    severity: "critical",
    duration: null,
    timestamp: "02:47:12.016",
    pid: 2847,
    cpu: 3,
    detail: "payment-handler exceeded 750ms threshold · payment failed",
    meta: { threshold_ms: "750", elapsed_ms: "812", action: "PAYMENT_FAILED" },
  },
];

const MOCK_EDGES: GraphEdge[] = [
  {
    id: "e1",
    source: "n1",
    target: "n7",
    label: "initiates",
    delayMs: 0.4,
    causal: true,
  },
  {
    id: "e2",
    source: "n1",
    target: "n2",
    label: "triggers",
    delayMs: 0.4,
    causal: true,
  },
  {
    id: "e3",
    source: "n2",
    target: "n3",
    label: "passes → write",
    delayMs: 1.2,
    causal: true,
  },
  {
    id: "e4",
    source: "n3",
    target: "n4",
    label: "syscall",
    delayMs: 0,
    causal: true,
  },
  {
    id: "e5",
    source: "n4",
    target: "n5",
    label: "triggers",
    delayMs: 0,
    causal: true,
  },
  {
    id: "e6",
    source: "n5",
    target: "n6",
    label: "causes",
    delayMs: 0,
    causal: true,
  },
  {
    id: "e7",
    source: "n6",
    target: "n4",
    label: "800ms delay",
    delayMs: 800,
    causal: true,
  },
  {
    id: "e8",
    source: "n3",
    target: "n8",
    label: "exceeded SLA",
    delayMs: 800,
    causal: true,
  },
  {
    id: "e9",
    source: "n8",
    target: "n1",
    label: "fails",
    delayMs: 0,
    causal: true,
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Partial<Record<EventType, string>> = {
  tcp_sendmsg: "tcp_send",
  tcp_recvmsg: "tcp_recv",
  sys_write: "sys_write",
  sys_read: "sys_read",
  sched_switch: "sched",
  mm_page_fault: "page_fault",
  payment: "payment",
  settlement: "settlement",
  risk_check: "risk_check",
  timeout: "timeout",
};

// severity → node fill / stroke
function severityColor(s: Severity): {
  fill: string;
  stroke: string;
  glow: string;
} {
  switch (s) {
    case "root_cause":
      return {
        fill: "rgba(245,158,11,0.18)",
        stroke: "var(--accent)",
        glow: "rgba(245,158,11,0.5)",
      };
    case "critical":
      return {
        fill: "rgba(239,68,68,0.14)",
        stroke: "#ef4444",
        glow: "rgba(239,68,68,0.4)",
      };
    case "slow":
      return {
        fill: "rgba(251,146,60,0.12)",
        stroke: "#fb923c",
        glow: "rgba(251,146,60,0.35)",
      };
    default:
      return {
        fill: "rgba(240,238,235,0.06)",
        stroke: "var(--border)",
        glow: "transparent",
      };
  }
}

function severityLabel(s: Severity): string {
  switch (s) {
    case "root_cause":
      return "root cause";
    case "critical":
      return "critical";
    case "slow":
      return "slow";
    default:
      return "normal";
  }
}

function fmtDur(us: number | null): string {
  if (us === null) return "—";
  if (us < 1_000) return `${us}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GraphPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);

  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showCausalOnly, setShowCausalOnly] = useState(false);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const buildGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = containerRef.current.getBoundingClientRect();

    // ── Defs: arrowhead markers ──
    const defs = svg.append("defs");

    const markerFor = (id: string, color: string) => {
      defs
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -4 8 8")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L8,0L0,4")
        .attr("fill", color);
    };

    markerFor("arrow-causal", "var(--accent)");
    markerFor("arrow-normal", "var(--border)");
    markerFor("arrow-critical", "#ef4444");

    // Subtle radial bg gradient
    const radial = defs
      .append("radialGradient")
      .attr("id", "bg-grad")
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "60%");
    radial
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "var(--bg-elevated)")
      .attr("stop-opacity", 0.5);
    radial
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "var(--bg)")
      .attr("stop-opacity", 0);

    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#bg-grad)");

    // ── Zoom layer ──
    const g = svg.append("g").attr("class", "zoom-layer");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (e) => g.attr("transform", e.transform));

    svg.call(zoom);

    // Default zoom to center
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85),
    );

    // ── Deep-clone nodes / edges for d3 mutation ──
    const nodes: GraphNode[] = MOCK_NODES.map((n) => ({ ...n }));
    const edges: GraphEdge[] = (
      showCausalOnly ? MOCK_EDGES.filter((e) => e.causal) : MOCK_EDGES
    ).map((e) => ({ ...e }));

    // ── Simulation ──
    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(140)
          .strength(0.5),
      )
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(0, 0))
      .force("collide", d3.forceCollide(52));

    simRef.current = sim;

    // ── Edges ──
    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", (d) => {
        const src = d.source as GraphNode;
        if (src.severity === "root_cause" || src.severity === "critical")
          return src.severity === "root_cause" ? "var(--accent)" : "#ef4444";
        return "var(--border)";
      })
      .attr("stroke-width", (d) => (d.delayMs > 100 ? 2 : 1.2))
      .attr("stroke-opacity", 0.55)
      .attr("stroke-dasharray", (d) => (d.causal ? "none" : "4 3"))
      .attr("marker-end", (d) => {
        const src = d.source as GraphNode;
        if (src.severity === "root_cause") return "url(#arrow-causal)";
        if (src.severity === "critical") return "url(#arrow-critical)";
        return "url(#arrow-normal)";
      });

    // Edge labels
    const edgeLabel = g
      .append("g")
      .attr("class", "edge-labels")
      .selectAll("text")
      .data(edges)
      .join("text")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "9px")
      .attr("fill", "var(--text-muted)")
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none")
      .text((d) => (d.delayMs > 0 ? `${d.label} · ${d.delayMs}ms` : d.label));

    // ── Nodes ──
    const nodeG = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      )
      .on("click", (_event, d) => {
        setSelected((prev) => (prev?.id === d.id ? null : d));
      })
      .on("mouseenter", (_event, d) => setHoveredId(d.id))
      .on("mouseleave", () => setHoveredId(null));

    // Glow circle (root_cause / critical only)
    nodeG
      .filter((d) => d.severity === "root_cause" || d.severity === "critical")
      .append("circle")
      .attr("r", 30)
      .attr("fill", "none")
      .attr("stroke", (d) =>
        d.severity === "root_cause" ? "var(--accent)" : "#ef4444",
      )
      .attr("stroke-width", 0.5)
      .attr("stroke-opacity", 0.25)
      .attr("filter", (d) =>
        d.severity === "root_cause"
          ? "drop-shadow(0 0 10px rgba(245,158,11,0.35))"
          : "drop-shadow(0 0 8px rgba(239,68,68,0.3))",
      );

    // Main node circle
    nodeG
      .append("circle")
      .attr("r", 22)
      .attr("fill", (d) => severityColor(d.severity).fill)
      .attr("stroke", (d) => severityColor(d.severity).stroke)
      .attr("stroke-width", (d) => (d.severity === "root_cause" ? 1.5 : 1));

    // Node type badge (small text inside circle)
    nodeG
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "7px")
      .attr("font-weight", "600")
      .attr("fill", (d) =>
        d.severity === "root_cause"
          ? "var(--accent)"
          : d.severity === "critical"
            ? "#ef4444"
            : d.severity === "slow"
              ? "#fb923c"
              : "var(--text-muted)",
      )
      .attr("pointer-events", "none")
      .text((d) => TYPE_LABELS[d.type] ?? d.type);

    // Node label (below circle) — shown when showLabels
    nodeG
      .append("text")
      .attr("class", "node-label")
      .attr("text-anchor", "middle")
      .attr("y", 32)
      .attr("font-family", "var(--font)")
      .attr("font-size", "11px")
      .attr("font-weight", "500")
      .attr("fill", "var(--text-secondary)")
      .attr("pointer-events", "none")
      .attr("opacity", showLabels ? 1 : 0)
      .text((d) => d.label);

    // ── Tick ──
    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);

      edgeLabel
        .attr("x", (d) => {
          const sx = (d.source as GraphNode).x!;
          const tx = (d.target as GraphNode).x!;
          return (sx + tx) / 2;
        })
        .attr("y", (d) => {
          const sy = (d.source as GraphNode).y!;
          const ty = (d.target as GraphNode).y!;
          return (sy + ty) / 2 - 6;
        });

      nodeG.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [showCausalOnly, showLabels]);

  useEffect(() => {
    const cleanup = buildGraph();
    return () => {
      cleanup?.();
      simRef.current?.stop();
    };
  }, [buildGraph]);

  // ── Update label visibility without full rebuild ──
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll(".node-label")
      .attr("opacity", showLabels ? 1 : 0);
  }, [showLabels]);

  const node = selected;

  return (
    <div style={s.root}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.tlLeft}>
          <span style={s.filterLabel}>incident</span>
          <span style={s.incidentBadge}>
            payment #98721 · 02:47:11 · ₹50,000
          </span>
        </div>
        <div style={s.tlRight}>
          <Legend />
          <div style={s.divider} />
          <CtrlBtn active={showLabels} onClick={() => setShowLabels((v) => !v)}>
            labels
          </CtrlBtn>
          <CtrlBtn
            active={showCausalOnly}
            onClick={() => setShowCausalOnly((v) => !v)}
          >
            causal only
          </CtrlBtn>
        </div>
      </div>

      {/* Stats bar */}
      <div style={s.statsBar}>
        <Stat num={String(MOCK_NODES.length)} label="nodes" />
        <StatDiv />
        <Stat
          num={String(
            showCausalOnly
              ? MOCK_EDGES.filter((e) => e.causal).length
              : MOCK_EDGES.length,
          )}
          label="edges"
        />
        <StatDiv />
        <Stat
          num={String(
            MOCK_NODES.filter((n) => n.severity === "root_cause").length,
          )}
          label="root causes"
          accent
        />
        <StatDiv />
        <Stat
          num={String(
            MOCK_NODES.filter((n) => n.severity === "critical").length,
          )}
          label="critical"
          red
        />
        <StatDiv />
        <Stat num="800ms" label="max delay" accent />
      </div>

      {/* Graph + detail panel */}
      <div style={s.body}>
        {/* D3 canvas */}
        <div ref={containerRef} style={s.canvas}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ display: "block" }}
          />
          {/* Hint */}
          <div style={s.hint}>
            scroll to zoom · drag to pan · click node to inspect
          </div>
        </div>

        {/* Detail panel */}
        <div
          style={{
            ...s.detail,
            transform: node ? "translateX(0)" : "translateX(100%)",
            opacity: node ? 1 : 0,
            pointerEvents: node ? "auto" : "none",
          }}
        >
          {node && <NodeDetail node={node} onClose={() => setSelected(null)} />}
        </div>
      </div>
    </div>
  );
}

// ─── NodeDetail ───────────────────────────────────────────────────────────────

function NodeDetail({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  const col = severityColor(node.severity);
  const slow = node.duration !== null && node.duration > 500_000;

  return (
    <div style={sd.root}>
      {/* Header */}
      <div style={sd.header}>
        <div style={sd.headerLeft}>
          <span
            style={{
              ...sd.severityDot,
              backgroundColor: col.stroke,
            }}
          />
          <span style={sd.title}>{node.label}</span>
        </div>
        <button onClick={onClose} style={sd.closeBtn}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M1 1l8 8M9 1l-8 8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Severity badge */}
      <div style={sd.body}>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap" as const,
            marginBottom: "1rem",
          }}
        >
          <Badge
            label={severityLabel(node.severity)}
            style={
              node.severity === "root_cause"
                ? {
                    backgroundColor: "var(--accent-dim)",
                    color: "var(--accent)",
                    borderColor: "rgba(245,158,11,0.25)",
                  }
                : node.severity === "critical"
                  ? {
                      backgroundColor: "rgba(239,68,68,0.12)",
                      color: "#ef4444",
                      borderColor: "rgba(239,68,68,0.25)",
                    }
                  : node.severity === "slow"
                    ? {
                        backgroundColor: "rgba(251,146,60,0.1)",
                        color: "#fb923c",
                        borderColor: "rgba(251,146,60,0.2)",
                      }
                    : {}
            }
          />
          <Badge label={TYPE_LABELS[node.type] ?? node.type} />
        </div>

        <Section label="event">
          <KV k="service" v={node.service} />
          <KV k="pid" v={String(node.pid)} />
          <KV k="cpu" v={String(node.cpu)} />
          <KV k="timestamp" v={node.timestamp} />
          <KV k="duration" v={fmtDur(node.duration)} accent={slow} />
        </Section>

        <Section label="detail">
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              gridColumn: "1 / -1",
              paddingTop: "0.125rem",
            }}
          >
            {node.detail}
          </div>
        </Section>

        <Section label="raw fields">
          {Object.entries(node.meta).map(([k, v]) => (
            <KV key={k} k={k} v={v} />
          ))}
        </Section>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Legend() {
  const items: { color: string; label: string }[] = [
    { color: "var(--accent)", label: "root cause" },
    { color: "#ef4444", label: "critical" },
    { color: "#fb923c", label: "slow" },
    { color: "var(--border)", label: "normal" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
      {items.map((i) => (
        <div
          key={i.label}
          style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: i.color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              color: "var(--text-muted)",
              letterSpacing: "0.02em",
            }}
          >
            {i.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function CtrlBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.25rem 0.625rem",
        backgroundColor: active ? "var(--accent-dim)" : "transparent",
        border: `1px solid ${active ? "rgba(245,158,11,0.3)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontSize: "0.7rem",
        fontFamily: "var(--font)",
        fontWeight: 600,
        letterSpacing: "0.04em",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Stat({
  num,
  label,
  accent,
  red,
}: {
  num: string;
  label: string;
  accent?: boolean;
  red?: boolean;
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
          color: red
            ? "#ef4444"
            : accent
              ? "var(--accent)"
              : "var(--text-secondary)",
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

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div
        style={{
          fontSize: "0.58rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase" as const,
          color: "var(--accent)",
          marginBottom: "0.5rem",
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

function Badge({
  label,
  style: extra,
}: {
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: "0.62rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        padding: "0.15em 0.5em",
        borderRadius: "3px",
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        color: "var(--text-secondary)",
        ...extra,
      }}
    >
      {label}
    </span>
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
    gap: "0.625rem",
  },
  tlRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    flexShrink: 0,
  },
  filterLabel: {
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  },
  incidentBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.68rem",
    color: "var(--text-secondary)",
    padding: "0.2rem 0.55rem",
    borderRadius: "3px",
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
  },
  divider: {
    width: "1px",
    height: "16px",
    backgroundColor: "var(--border-subtle)",
    flexShrink: 0,
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
  body: {
    flex: 1,
    display: "flex",
    minHeight: 0,
    position: "relative" as const,
    overflow: "hidden",
  },
  canvas: {
    flex: 1,
    position: "relative" as const,
    overflow: "hidden",
  },
  hint: {
    position: "absolute" as const,
    bottom: "1rem",
    left: "50%",
    transform: "translateX(-50%)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.6rem",
    color: "var(--text-muted)",
    letterSpacing: "0.06em",
    pointerEvents: "none" as const,
    userSelect: "none" as const,
  },
  detail: {
    width: "280px",
    flexShrink: 0,
    borderLeft: "1px solid var(--border-subtle)",
    backgroundColor: "var(--bg-subtle)",
    transition: "transform 200ms ease, opacity 160ms ease",
    overflow: "hidden",
  },
};

const sd: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.875rem 1rem",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    gap: "0.5rem",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    minWidth: 0,
  },
  severityDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  title: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  closeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    backgroundColor: "transparent",
    border: "1px solid transparent",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "1rem",
  },
};
