import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import dagre from "dagre";
import type { EventType, KernelEvent } from "../types/events";
import {
  TYPE_SHORT,
  TYPE_COLORS,
  generateEvent,
  fmtDur,
  isSlow,
} from "../lib/mockData";
import { useConnection } from "../hooks/useConnection";
import { mapWireEvent } from "../lib/wireEvent";
import {
  PauseIcon,
  PlayIcon,
  ClearIcon,
  CloseIcon,
} from "../components/ui/icons";
import { KV } from "../components/ui/KV";

type NodeLayer = "domain" | "kernel" | "application";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  event: KernelEvent;
  layer: NodeLayer;
  severity: "normal" | "elevated" | "critical";
  x: number;
  y: number;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  source: string;
  target: string;
  latencyMs: number;
}

const KERNEL_TYPES: EventType[] = ["page_fault", "sched_switch"];
const DOMAIN_SERVICES = [
  "api-worker",
  "checkout-service",
  "auth-service",
  "database-writer",
];

const MAX_NODES = 40;
const TICK_MS = 1800;
const NODE_W = 140;
const NODE_H = 52;
const CAUSAL_WINDOW_NS = 5_000_000;

function getLayer(evt: KernelEvent): NodeLayer {
  if (KERNEL_TYPES.includes(evt.type)) return "kernel";
  if (DOMAIN_SERVICES.includes(evt.service)) return "domain";
  return "application";
}

function getSeverity(evt: KernelEvent): "normal" | "elevated" | "critical" {
  if (evt.durationUs === null) return "normal";
  if (evt.durationUs > 800_000) return "critical";
  if (evt.durationUs > 200_000) return "elevated";
  return "normal";
}

function shouldPromote(evt: KernelEvent): boolean {
  if (KERNEL_TYPES.includes(evt.type)) return true;
  if (isSlow(evt.durationUs)) return true;
  if (
    DOMAIN_SERVICES.includes(evt.service) &&
    evt.durationUs !== null &&
    evt.durationUs > 200_000
  )
    return true;
  return true;
}

function inferEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const sorted = [...nodes].sort(
    (a, b) => a.event.timestampNs - b.event.timestampNs,
  );

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const src = sorted[i];
      const tgt = sorted[j];
      const dt = tgt.event.timestampNs - src.event.timestampNs;
      if (dt > CAUSAL_WINDOW_NS) break;

      const linked =
        src.event.service === tgt.event.service ||
        src.event.pid === tgt.event.pid ||
        (src.layer === "kernel" && tgt.layer !== "kernel") ||
        (src.layer === "application" && tgt.layer === "domain");

      if (
        linked &&
        !edges.some((e) => e.sourceId === src.id && e.targetId === tgt.id)
      ) {
        edges.push({
          id: `${src.id}->${tgt.id}`,
          source: src.id,
          target: tgt.id,
          sourceId: src.id,
          targetId: tgt.id,
          latencyMs: dt / 1_000_000,
        });
      }
    }
  }
  return edges;
}

function getPathIds(nodeId: string, edges: GraphEdge[]): Set<string> {
  const ancestors = new Set<string>();
  const descendants = new Set<string>();

  const aq = [nodeId];
  while (aq.length) {
    const cur = aq.shift()!;
    for (const e of edges) {
      if (e.targetId === cur && !ancestors.has(e.sourceId)) {
        ancestors.add(e.sourceId);
        aq.push(e.sourceId);
      }
    }
  }

  const dq = [nodeId];
  while (dq.length) {
    const cur = dq.shift()!;
    for (const e of edges) {
      if (e.sourceId === cur && !descendants.has(e.targetId)) {
        descendants.add(e.targetId);
        dq.push(e.targetId);
      }
    }
  }

  return new Set([...ancestors, nodeId, ...descendants]);
}

function layoutDAG(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 100,
    ranksep: 120,
    marginx: 60,
    marginy: 60,
  });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) =>
    g.setNode(n.id, { width: NODE_W + 40, height: NODE_H + 40 }),
  );
  edges.forEach((e) => g.setEdge(e.sourceId, e.targetId));
  dagre.layout(g);

  return nodes.map((node) => {
    const dn = g.node(node.id);
    if (!dn) return node;
    return { ...node, x: dn.x, y: dn.y };
  });
}

export default function GraphPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  const { status, messages } = useConnection();
  const processedMessageRef = useRef(0);

  pausedRef.current = paused;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNode(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const renderGraph = useCallback(
    (nodes: GraphNode[], edges: GraphEdge[], selected: GraphNode | null) => {
      const svg = d3.select(svgRef.current!);
      const relevantIds = selected
        ? getPathIds(selected.id, edges)
        : new Set<string>();

      const edgeSel = svg
        .select<SVGGElement>(".edges-group")
        .selectAll<SVGLineElement, GraphEdge>(".edge")
        .data(edges, (d) => d.id);

      edgeSel.exit().remove();

      const edgeMerge = edgeSel
        .enter()
        .append("line")
        .attr("class", "edge")
        .merge(edgeSel);

      edgeMerge
        .classed(
          "on-path",
          (d) =>
            !!selected &&
            relevantIds.has(d.sourceId) &&
            relevantIds.has(d.targetId),
        )
        .classed(
          "dimmed",
          (d) =>
            !!selected &&
            !(relevantIds.has(d.sourceId) && relevantIds.has(d.targetId)),
        )
        .attr("stroke-dasharray", (d) => (d.latencyMs > 50 ? "4 3" : "none"))
        .attr("marker-end", (d) => {
          const onPath =
            selected &&
            relevantIds.has(d.sourceId) &&
            relevantIds.has(d.targetId);
          return onPath ? "url(#arr-amber)" : "url(#arr-muted)";
        })
        .attr("x1", (d) => nodes.find((n) => n.id === d.sourceId)?.x ?? 0)
        .attr("y1", (d) => nodes.find((n) => n.id === d.sourceId)?.y ?? 0)
        .attr("x2", (d) => {
          const src = nodes.find((n) => n.id === d.sourceId);
          const tgt = nodes.find((n) => n.id === d.targetId);
          if (!src || !tgt) return 0;
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return tgt.x - (dx / dist) * (NODE_W / 2 + 4);
        })
        .attr("y2", (d) => {
          const src = nodes.find((n) => n.id === d.sourceId);
          const tgt = nodes.find((n) => n.id === d.targetId);
          if (!src || !tgt) return 0;
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return tgt.y - (dy / dist) * (NODE_H / 2 + 4);
        });

      const nodeSel = svg
        .select<SVGGElement>(".nodes-group")
        .selectAll<SVGGElement, GraphNode>(".node-g")
        .data(nodes, (d) => d.id);

      nodeSel.exit().remove();

      const nodeEnter = nodeSel
        .enter()
        .append("g")
        .attr("class", "node-g")
        .on("click", (event, d) => {
          event.stopPropagation();
          setSelectedNode((prev) => (prev?.id === d.id ? null : d));
        });

      nodeEnter
        .append("rect")
        .attr("class", "node-rect")
        .attr("x", -NODE_W / 2)
        .attr("y", -NODE_H / 2)
        .attr("width", NODE_W)
        .attr("height", NODE_H)
        .attr("rx", 0);

      nodeEnter
        .append("rect")
        .attr("class", "node-bar")
        .attr("x", -NODE_W / 2)
        .attr("y", -NODE_H / 2)
        .attr("width", NODE_W)
        .attr("height", 4)
        .attr("rx", 0);

      nodeEnter
        .append("text")
        .attr("class", "node-type")
        .attr("text-anchor", "middle")
        .attr("y", -10)
        .attr("font-family", "var(--font-mono, monospace)")
        .attr("font-size", "9px")
        .attr("font-weight", "700")
        .attr("pointer-events", "none");

      nodeEnter
        .append("text")
        .attr("class", "node-detail")
        .attr("text-anchor", "middle")
        .attr("y", 6)
        .attr("font-family", "var(--font-mono, monospace)")
        .attr("font-size", "8px")
        .attr("font-weight", "400")
        .attr("pointer-events", "none");

      nodeEnter
        .append("text")
        .attr("class", "node-dur")
        .attr("text-anchor", "middle")
        .attr("y", 19)
        .attr("font-family", "var(--font-mono, monospace)")
        .attr("font-size", "8px")
        .attr("pointer-events", "none");

      const nodeMerge = nodeEnter.merge(nodeSel);

      nodeMerge
        .classed("selected", (d) => selected?.id === d.id)
        .classed("on-path", (d) => !!selected && relevantIds.has(d.id))
        .classed("dimmed", (d) => !!selected && !relevantIds.has(d.id));

      nodeMerge.select<SVGRectElement>(".node-bar").attr("fill", (d) => {
        if (d.severity === "critical") return "#ef4444";
        if (d.severity === "elevated") return "var(--accent)";
        return TYPE_COLORS[d.event.type].canvas;
      });

      nodeMerge
        .select<SVGTextElement>(".node-type")
        .text((d) => TYPE_SHORT[d.event.type]);

      nodeMerge.select<SVGTextElement>(".node-detail").text((d) => {
        const t = d.event.detail;
        return t.length > 26 ? t.slice(0, 23) + "…" : t;
      });

      nodeMerge
        .select<SVGTextElement>(".node-dur")
        .text((d) => fmtDur(d.event.durationUs));

      nodeMerge.attr("transform", (d) => `translate(${d.x},${d.y})`);
    },
    [],
  );

  useEffect(() => {
    const el = containerRef.current!;
    const w = el.clientWidth || 1000;
    const h = el.clientHeight || 700;

    const svg = d3.select(svgRef.current!);
    svg.attr("width", w).attr("height", h);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    const mkMarker = (id: string, colorVar: string) =>
      defs
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 10)
        .attr("refY", 5)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M 0 0 L 10 5 L 0 10 z")
        .style("fill", colorVar);

    mkMarker("arr-amber", "var(--accent)");
    mkMarker("arr-muted", "var(--border)");

    svg
      .append("rect")
      .attr("class", "bg-rect")
      .attr("width", w)
      .attr("height", h);

    svg.append("g").attr("class", "edges-group");
    svg.append("g").attr("class", "nodes-group");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        svg.select(".edges-group").attr("transform", event.transform);
        svg.select(".nodes-group").attr("transform", event.transform);
      });

    svg.call(zoom);
    svg.on("click", () => setSelectedNode(null));
  }, []);

  useEffect(() => {
    if (pausedRef.current) return;
    const pending = messages.filter(
      (message) => message.id > processedMessageRef.current,
    );
    let newNodes = [...nodesRef.current];
    for (const message of pending) {
      try {
        const evt = mapWireEvent(JSON.parse(message.data), message.id);
        if (shouldPromote(evt)) {
          newNodes.push({
            id: evt.id,
            event: evt,
            layer: getLayer(evt),
            severity: getSeverity(evt),
            x: 0,
            y: 0,
          });
        }
      } catch {}
      processedMessageRef.current = message.id;
    }
    if (newNodes.length === nodesRef.current.length) return;
    if (newNodes.length > MAX_NODES) newNodes = newNodes.slice(-MAX_NODES);

    const newEdges = inferEdges(newNodes);
    const laid = layoutDAG(newNodes, newEdges);

    nodesRef.current = laid;
    edgesRef.current = newEdges;
    setNodeCount(laid.length);
    setEdgeCount(newEdges.length);

    setSelectedNode((sel) => {
      if (sel && !laid.find((n) => n.id === sel.id)) return null;
      renderGraph(laid, newEdges, sel);
      return sel;
    });
  }, [messages, paused, renderGraph]);

  useEffect(() => {
    if (status !== "mock") return;
    const iv = setInterval(() => {
      if (pausedRef.current) return;
      const evt = generateEvent();
      if (!shouldPromote(evt)) return;

      const node: GraphNode = {
        id: evt.id,
        event: evt,
        layer: getLayer(evt),
        severity: getSeverity(evt),
        x: 0,
        y: 0,
      };

      let newNodes = [...nodesRef.current, node];
      if (newNodes.length > MAX_NODES) newNodes = newNodes.slice(-MAX_NODES);

      const newEdges = inferEdges(newNodes);
      const laid = layoutDAG(newNodes, newEdges);

      nodesRef.current = laid;
      edgesRef.current = newEdges;
      setNodeCount(laid.length);
      setEdgeCount(newEdges.length);

      setSelectedNode((sel) => {
        if (sel && !laid.find((n) => n.id === sel.id)) return null;
        renderGraph(laid, newEdges, sel);
        return sel;
      });
    }, TICK_MS);

    return () => clearInterval(iv);
  }, [status, renderGraph]);

  useEffect(() => {
    if (nodesRef.current.length > 0) {
      renderGraph(nodesRef.current, edgesRef.current, selectedNode);
    }
  }, [selectedNode, renderGraph]);

  useEffect(() => {
    let timeoutId: number;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const el = containerRef.current;
        if (!el) return;
        const dims = { w: el.clientWidth || 1000, h: el.clientHeight || 700 };
        const svg = d3.select(svgRef.current!);
        svg.attr("width", dims.w).attr("height", dims.h);
        svg.select(".bg-rect").attr("width", dims.w).attr("height", dims.h);
      }, 150);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function clearGraph() {
    nodesRef.current = [];
    edgesRef.current = [];
    setSelectedNode(null);
    setNodeCount(0);
    setEdgeCount(0);
    d3.select(svgRef.current!).select(".edges-group").selectAll("*").remove();
    d3.select(svgRef.current!).select(".nodes-group").selectAll("*").remove();
  }

  return (
    <div style={s.root}>
      <style>{`
        .bg-rect {
          fill: var(--bg);
          transition: fill 0ms ease;
        }
        .edge {
          stroke: var(--border);
          stroke-width: 1px;
          transition: stroke 0ms ease, stroke-width 0ms ease, opacity 0ms ease;
        }
        .edge.on-path {
          stroke: var(--accent);
          stroke-width: 1.5px;
        }
        .edge.dimmed {
          opacity: 0.15;
        }
        .node-g {
          cursor: pointer;
          transition: opacity 0ms ease;
        }
        .node-g.dimmed {
          opacity: 0.2;
        }
        .node-rect {
          fill: var(--bg);
          stroke: var(--border);
          transition: fill 0ms ease, stroke 0ms ease, stroke-width 0ms ease;
        }
        .node-g:hover .node-rect {
          fill: var(--bg-elevated);
          stroke: var(--border-subtle);
        }
        .node-g.selected .node-rect {
          fill: var(--accent-dim);
          stroke: var(--accent);
          stroke-width: 1.5px;
        }
        .node-g.on-path .node-rect {
          fill: var(--accent-dim);
          stroke: var(--accent);
        }
        .node-type {
          fill: var(--text-primary);
          transition: fill 0ms ease;
        }
        .node-g.selected .node-type,
        .node-g.on-path .node-type {
          fill: var(--accent);
        }
        .node-detail, .node-dur {
          fill: var(--text-muted);
          transition: fill 0ms ease;
        }
      `}</style>
      <div style={s.toolbar}>
        <div style={s.tlLeft}>
          <StatPill num={nodeCount} label="nodes" />
          <StatPill num={edgeCount} label="edges" />
        </div>
        <div style={s.tlRight}>
          <button
            style={{ ...s.ctrlBtn, ...(paused ? s.ctrlBtnOn : {}) }}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? "resume" : "pause"}
          </button>
          <button style={s.ctrlBtn} onClick={clearGraph}>
            <ClearIcon /> clear
          </button>
        </div>
      </div>

      <div style={s.canvasWrapper} ref={containerRef}>
        <svg ref={svgRef} style={s.svg} />
        {nodeCount === 0 && (
          <div style={s.emptyState}>
            <span style={s.emptyText}>awaiting promoted events</span>
          </div>
        )}
      </div>

      {selectedNode && (
        <div style={s.detailPanel}>
          <div style={s.detailHeader}>
            <span style={s.detailType}>{selectedNode.event.type}</span>
            <span style={s.detailSep}>·</span>
            <span style={s.detailSvc}>{selectedNode.event.service}</span>
            <span style={s.detailDur}>
              {fmtDur(selectedNode.event.durationUs)}
            </span>
            <button
              style={s.closeBtn}
              onClick={() => setSelectedNode(null)}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
          <div style={s.detailGrid}>
            <KV k="pid" v={String(selectedNode.event.pid)} />
            <KV k="tid" v={String(selectedNode.event.tid)} />
            <KV k="cpu" v={String(selectedNode.event.cpu)} />
            <KV k="timestamp" v={selectedNode.event.timestamp} />
            <KV k="layer" v={selectedNode.layer} />
            <KV
              k="severity"
              v={selectedNode.severity}
              accent={selectedNode.severity !== "normal"}
            />
            <KV k="detail" v={selectedNode.event.detail} />
            {Object.entries(selectedNode.event.meta).map(([k, v]) => (
              <KV key={k} k={k} v={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ num, label }: { num: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "var(--text-secondary)",
        }}
      >
        {num}
      </span>
      <span
        style={{
          fontSize: "0.58rem",
          color: "var(--text-muted)",
          fontWeight: 500,
        }}
      >
        {label}
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
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 1.25rem",
    height: "44px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
    backgroundColor: "var(--bg-subtle)",
    gap: "1rem",
  },
  tlLeft: { display: "flex", alignItems: "center", gap: "1rem" },
  tlRight: { display: "flex", alignItems: "center", gap: "0.625rem" },
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
  canvasWrapper: { flex: 1, position: "relative", overflow: "hidden" },
  svg: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  emptyState: {
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
  detailPanel: {
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
