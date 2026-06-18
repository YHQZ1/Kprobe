import type { EventType, KernelEvent } from "../types/events";
import { fmtDur } from "./mockData";

export interface DebugEdge {
  sourceId: string;
  targetId: string;
  latencyMs: number;
  causeType?: string;
}

export interface DebugSummary {
  status: "nominal" | "degraded" | "critical";
  title: string;
  primaryCause: string;
  impact: string;
  evidence: string[];
  nextStep: string;
  slowestEvent: KernelEvent | null;
  transactionId: string;
  services: string[];
  pids: number[];
}

const TYPE_DOMAIN: Record<EventType, string> = {
  tcp_send: "network send",
  tcp_recv: "network receive",
  tcp_retransmit: "network retransmit",
  sys_write: "write syscall",
  sys_read: "read syscall",
  sched_switch: "scheduler",
  page_fault: "memory fault",
  block_io: "disk I/O",
};

const CAUSE_LABELS: Record<string, string> = {
  DISK_TO_SYSCALL: "disk wait feeding a syscall",
  READ_TO_WRITE: "read-to-write dependency",
  WRITE_TO_READ: "write-to-read dependency",
  CROSS_THREAD_READ_TO_WRITE: "cross-thread read/write handoff",
  CROSS_THREAD_WRITE_TO_READ: "cross-thread write/read handoff",
  SCHED_DELAY: "scheduler delay",
  CPU_CONTENTION: "CPU contention",
  CROSS_THREAD_CPU_CONTENTION: "cross-thread CPU contention",
  MEMORY_PRESSURE: "memory pressure",
  TCP_RTT: "network round trip",
  CROSS_THREAD_TCP_RTT: "cross-thread network delay",
  SEQUENTIAL: "sequential ordering",
};

function durationScore(event: KernelEvent): number {
  return event.durationUs ?? 0;
}

function eventLabel(event: KernelEvent): string {
  return `${event.type} on ${event.service || "kernel"} pid=${event.pid}`;
}

function summarizeCause(causeType?: string): string {
  if (!causeType) return "local live timing";
  return CAUSE_LABELS[causeType] ?? causeType.toLowerCase().replaceAll("_", " ");
}

function inferCauseFromEvents(events: KernelEvent[]): string {
  if (events.some((event) => event.type === "block_io")) return "disk I/O wait";
  if (events.some((event) => event.type === "sched_switch")) return "scheduler delay";
  if (events.some((event) => event.type === "page_fault")) return "memory pressure";
  if (events.some((event) => event.type === "tcp_retransmit")) return "network retransmit";
  if (events.some((event) => event.type === "tcp_recv" || event.type === "tcp_send")) {
    return "network timing";
  }
  return "syscall latency";
}

function nextStepFor(cause: string, slowest: KernelEvent | null): string {
  if (cause.includes("disk")) return "Inspect block_io before the slow syscall and compare sector/op/latency.";
  if (cause.includes("scheduler") || cause.includes("CPU")) {
    return "Inspect sched_switch events around the slow pid/tid for preemption or CPU contention.";
  }
  if (cause.includes("memory")) return "Inspect page_fault events before the slow read/write path.";
  if (cause.includes("network")) return "Inspect tcp_recv/tcp_send timing and retransmits for the same transaction.";
  if (slowest) return `Inspect ${slowest.type} around pid ${slowest.pid}, then follow adjacent edges.`;
  return "Generate or select a transaction with edges, then inspect the slowest event.";
}

export function explainEvent(event: KernelEvent): string {
  const domain = TYPE_DOMAIN[event.type];
  if (event.durationUs !== null && event.durationUs > 5_000_000) {
    return `${domain} took ${fmtDur(event.durationUs)}, which is unusually high and should be treated as the first suspect.`;
  }
  if (event.durationUs !== null && event.durationUs > 500_000) {
    return `${domain} is slow at ${fmtDur(event.durationUs)} and may explain user-visible latency.`;
  }
  if (event.type === "sched_switch") return "Scheduler activity can explain why a thread stopped running before work resumed.";
  if (event.type === "page_fault") return "Page faults can point to memory pressure or cold memory access before a syscall continues.";
  if (event.type === "block_io") return "Block I/O can explain read/write stalls when it appears before syscall latency.";
  return `${domain} event. Use nearby events and causal edges to decide whether it is cause or consequence.`;
}

export function analyzeDebugGraph(
  events: KernelEvent[],
  edges: DebugEdge[],
): DebugSummary {
  const slowestEvent = [...events].sort((a, b) => durationScore(b) - durationScore(a))[0] ?? null;
  const slowEvents = events
    .filter((event) => event.durationUs !== null && event.durationUs > 500_000)
    .sort((a, b) => durationScore(b) - durationScore(a));
  const services = [...new Set(events.map((event) => event.service || "kernel"))].slice(0, 6);
  const pids = [...new Set(events.map((event) => event.pid))].slice(0, 8);
  const transactionId =
    events.find((event) => event.meta.transaction_id)?.meta.transaction_id ?? "";

  const explicitCauses = edges
    .map((edge) => edge.causeType)
    .filter((cause): cause is string => Boolean(cause));
  const causeCounts = new Map<string, number>();
  for (const cause of explicitCauses) {
    causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
  }
  const topCause = [...causeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const primaryCause = topCause ? summarizeCause(topCause) : inferCauseFromEvents(events);

  const status =
    slowestEvent && (slowestEvent.durationUs ?? 0) > 5_000_000
      ? "critical"
      : slowEvents.length > 0 || edges.length > 0
        ? "degraded"
        : "nominal";

  const evidence: string[] = [];
  if (slowestEvent) {
    evidence.push(`Slowest event: ${eventLabel(slowestEvent)} at ${fmtDur(slowestEvent.durationUs)}.`);
  }
  if (topCause) {
    evidence.push(`Top causal edge: ${summarizeCause(topCause)} (${causeCounts.get(topCause)} edge${causeCounts.get(topCause) === 1 ? "" : "s"}).`);
  } else if (edges.length > 0) {
    evidence.push(`${edges.length} local timing edge${edges.length === 1 ? "" : "s"} connect nearby events.`);
  }
  if (services.length > 0) evidence.push(`Services involved: ${services.join(", ")}.`);
  if (slowEvents.length > 1) evidence.push(`${slowEvents.length} events exceed 500ms.`);

  return {
    status,
    title:
      status === "critical"
        ? "Critical latency path"
        : status === "degraded"
          ? "Potential latency path"
          : "No clear bottleneck yet",
    primaryCause,
    impact: slowestEvent
      ? `${eventLabel(slowestEvent)} is the current impact point.`
      : "Not enough events to identify an impact point.",
    evidence: evidence.slice(0, 4),
    nextStep: nextStepFor(primaryCause, slowestEvent),
    slowestEvent,
    transactionId,
    services,
    pids,
  };
}
