export type EventType =
  | "tcp_sendmsg"
  | "tcp_recvmsg"
  | "sys_write"
  | "sys_read"
  | "sched_switch"
  | "mm_page_fault";

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