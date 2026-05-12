export type EventType =
  | "tcp_sendmsg"
  | "tcp_recvmsg"
  | "sys_write"
  | "sys_read"
  | "sched_switch"
  | "mm_page_fault";

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

export interface ReplayEvent {
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

export interface Injections {
  timeoutMs: number;
  networkLatencyMs: number;
  memoryPressure: boolean;
  cpuThrottle: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
