export type EventType =
  | "tcp_send"
  | "tcp_recv"
  | "tcp_retransmit"
  | "sys_write"
  | "sys_read"
  | "sched_switch"
  | "page_fault"
  | "block_io";

export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "mock";

export interface KernelEvent {
  id: string;
  timestamp: string;
  timestampNs: number;
  type: EventType;
  pid: number;
  tid: number;
  cpu: number;
  service: string;
  detail: string;
  durationUs: number | null;
  meta: Record<string, string>;
}