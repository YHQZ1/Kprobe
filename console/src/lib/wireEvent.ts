import type { EventType, KernelEvent } from "../types/events";

const EVENT_TYPES = new Set<EventType>([
  "tcp_send",
  "tcp_recv",
  "tcp_retransmit",
  "sys_write",
  "sys_read",
  "sched_switch",
  "page_fault",
  "block_io",
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("kernel event must be an object");
  }
  return value as Record<string, unknown>;
}

function first(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

export function mapWireEvent(raw: unknown, fallbackId: number): KernelEvent {
  const event = asRecord(raw);
  const tsNs = Number(first(event, "timestampNs", "timestamp_ns") ?? Date.now() * 1e6);
  const durNs = Number(first(event, "durationNs", "duration_ns") ?? 0);
  const rawType = String(first(event, "eventType", "event_type") ?? "");
  if (!EVENT_TYPES.has(rawType as EventType)) {
    throw new Error(`unknown kernel event type: ${rawType || "missing"}`);
  }
  if (!Number.isFinite(tsNs) || tsNs <= 0 || !Number.isFinite(durNs) || durNs < 0) {
    throw new Error("kernel event has invalid timing fields");
  }
  const type = rawType as EventType;

  const date = new Date(tsNs / 1e6);
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  const timestamp = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;

  return {
    id: String(first(event, "eventId", "event_id") ?? `ws-${fallbackId}`),
    timestamp,
    timestampNs: tsNs,
    type,
    pid: Number(event.pid ?? 0),
    tid: Number(event.tid ?? event.pid ?? 0),
    cpu: Number(event.cpu ?? 0),
    service: String(first(event, "serviceName", "service_name") || "kernel"),
    detail: String(event.detail || `${type} · tid=${event.tid || event.pid || 0}`),
    durationUs: durNs > 0 ? Math.round(durNs / 1000) : null,
    meta: {
      transaction_id: String(first(event, "transactionId", "transaction_id") ?? ""),
      trace_id: String(first(event, "traceId", "trace_id") ?? ""),
      span_id: String(first(event, "spanId", "span_id") ?? ""),
    },
  };
}
