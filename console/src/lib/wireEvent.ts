import type { EventType, KernelEvent } from "../types/events";

export function mapWireEvent(raw: any, fallbackId: number): KernelEvent {
  const tsNs = Number(raw.timestampNs || raw.timestamp_ns || Date.now() * 1e6);
  const durNs = Number(raw.durationNs || raw.duration_ns || 0);
  const type = (raw.eventType || raw.event_type || "sys_write") as EventType;

  const date = new Date(tsNs / 1e6);
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  const timestamp = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;

  return {
    id: raw.eventId || raw.event_id || `ws-${fallbackId}`,
    timestamp,
    timestampNs: tsNs,
    type,
    pid: Number(raw.pid || 0),
    tid: Number(raw.tid || raw.pid || 0),
    cpu: Number(raw.cpu || 0),
    service: raw.serviceName || raw.service_name || "kernel",
    detail: raw.detail || `${type} · tid=${raw.tid || raw.pid}`,
    durationUs: durNs > 0 ? Math.round(durNs / 1000) : null,
    meta: {
      transaction_id: raw.transactionId || raw.transaction_id || "",
      trace_id: raw.traceId || raw.trace_id || "",
      span_id: raw.spanId || raw.span_id || "",
    },
  };
}
