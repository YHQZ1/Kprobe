import type { EventType, KernelEvent } from "../types/events";

export const SERVICES = [
  "payment-handler",
  "settlement-svc",
  "risk-engine",
  "ledger-writer",
  "order-router",
  "batch-job",
] as const;

export const EVENT_TYPES: EventType[] = [
  "tcp_sendmsg",
  "tcp_recvmsg",
  "sys_write",
  "sys_read",
  "sched_switch",
  "mm_page_fault",
];

export const TYPE_LABELS: Record<EventType, string> = {
  tcp_sendmsg: "tcp_send",
  tcp_recvmsg: "tcp_recv",
  sys_write: "sys_write",
  sys_read: "sys_read",
  sched_switch: "sched",
  mm_page_fault: "page_fault",
};

export const TYPE_SHORT: Record<EventType, string> = {
  tcp_sendmsg: "TCP↑",
  tcp_recvmsg: "TCP↓",
  sys_write: "WRITE",
  sys_read: "READ",
  sched_switch: "SCHED",
  mm_page_fault: "PF",
};

export const TYPE_COLORS: Record<
  EventType,
  { bg: string; border: string; text: string; canvas: string }
> = {
  tcp_sendmsg: {
    bg: "rgba(59,130,246,0.12)",
    border: "rgba(59,130,246,0.25)",
    text: "#60a5fa",
    canvas: "rgba(59,130,246,0.75)",
  },
  tcp_recvmsg: {
    bg: "rgba(99,102,241,0.12)",
    border: "rgba(99,102,241,0.25)",
    text: "#818cf8",
    canvas: "rgba(99,102,241,0.75)",
  },
  sys_write: {
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.25)",
    text: "#34d399",
    canvas: "rgba(16,185,129,0.75)",
  },
  sys_read: {
    bg: "rgba(20,184,166,0.12)",
    border: "rgba(20,184,166,0.25)",
    text: "#2dd4bf",
    canvas: "rgba(20,184,166,0.75)",
  },
  sched_switch: {
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.25)",
    text: "#f59e0b",
    canvas: "rgba(245,158,11,0.80)",
  },
  mm_page_fault: {
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.25)",
    text: "#f87171",
    canvas: "rgba(239,68,68,0.80)",
  },
};

type EventTemplate = (
  pid: number,
  svc: string,
) => {
  detail: string;
  meta: Record<string, string>;
  durationUs: number | null;
};

const EVENT_TEMPLATES: Record<EventType, EventTemplate> = {
  tcp_sendmsg: (_pid, svc) => {
    const dest = SERVICES[Math.floor(Math.random() * SERVICES.length)];
    const bytes = Math.floor(Math.random() * 8192 + 512);
    return {
      detail: `${svc} → ${dest} · ${(bytes / 1024).toFixed(1)}kb`,
      meta: {
        src_port: String(40000 + Math.floor(Math.random() * 10000)),
        dst_port: "8080",
        bytes: String(bytes),
        protocol: "TCP",
        direction: "egress",
      },
      durationUs: Math.floor(Math.random() * 800 + 50),
    };
  },
  tcp_recvmsg: (_pid, svc) => {
    const bytes = Math.floor(Math.random() * 4096 + 256);
    return {
      detail: `${svc} ← inbound · ${(bytes / 1024).toFixed(1)}kb`,
      meta: {
        src_port: String(40000 + Math.floor(Math.random() * 10000)),
        dst_port: "8080",
        bytes: String(bytes),
        protocol: "TCP",
        direction: "ingress",
      },
      durationUs: Math.floor(Math.random() * 400 + 20),
    };
  },
  sys_write: () => {
    const ops = ["ledger write", "journal flush", "WAL append", "index update"];
    const fd = Math.floor(Math.random() * 10 + 3);
    return {
      detail: `fd=${fd} · ${ops[Math.floor(Math.random() * ops.length)]}`,
      meta: {
        fd: String(fd),
        bytes: String(Math.floor(Math.random() * 16384 + 512)),
        offset: String(Math.floor(Math.random() * 1000000)),
        flags: "O_WRONLY|O_APPEND",
      },
      durationUs: Math.floor(Math.random() * 1200 + 100),
    };
  },
  sys_read: () => {
    const ops = ["index scan", "page read", "WAL read", "snapshot fetch"];
    const fd = Math.floor(Math.random() * 10 + 3);
    return {
      detail: `fd=${fd} · ${ops[Math.floor(Math.random() * ops.length)]}`,
      meta: {
        fd: String(fd),
        bytes: String(Math.floor(Math.random() * 8192 + 256)),
        offset: String(Math.floor(Math.random() * 1000000)),
        flags: "O_RDONLY",
      },
      durationUs: Math.floor(Math.random() * 600 + 50),
    };
  },
  sched_switch: (pid) => {
    const delayed = Math.random() > 0.7;
    const delayMs = delayed
      ? Math.floor(Math.random() * 600 + 100)
      : Math.floor(Math.random() * 40 + 2);
    const cpu = Math.floor(Math.random() * 8);
    const nextPid = Math.floor(Math.random() * 9000 + 1000);
    return {
      detail: delayed
        ? `preempted · CPU ${cpu} → PID ${nextPid} · ${delayMs}ms delayed`
        : `resumed · CPU ${cpu} · ${delayMs}ms`,
      meta: {
        prev_pid: String(pid),
        next_pid: String(nextPid),
        cpu: String(cpu),
        delay_ms: String(delayMs),
        prev_state: delayed ? "TASK_RUNNING" : "TASK_INTERRUPTIBLE",
      },
      durationUs: delayMs * 1000,
    };
  },
  mm_page_fault: () => {
    const addr = Math.floor(Math.random() * 0xffffffffffff)
      .toString(16)
      .padStart(12, "0");
    const kinds = ["minor fault", "major fault", "memory pressure"];
    return {
      detail: `addr=0x${addr} · ${kinds[Math.floor(Math.random() * kinds.length)]}`,
      meta: {
        address: `0x${addr}`,
        fault_type: Math.random() > 0.5 ? "minor" : "major",
        vma_flags: "VM_READ|VM_WRITE",
        pgfault: String(Math.floor(Math.random() * 1000)),
      },
      durationUs: Math.floor(Math.random() * 2000 + 200),
    };
  },
};

let idCounter = 0;
let baseNs = Date.now() * 1_000_000;

export function generateEvent(): KernelEvent {
  idCounter++;
  baseNs += Math.floor(Math.random() * 800_000 + 100_000);

  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const pid = Math.floor(Math.random() * 9000 + 1000);
  const tid = pid + Math.floor(Math.random() * 4);
  const cpu = Math.floor(Math.random() * 8);
  const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  const { detail, meta, durationUs } = EVENT_TEMPLATES[type](pid, service);

  const now = new Date();
  const ts =
    [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":") +
    "." +
    String(now.getMilliseconds()).padStart(3, "0");

  return {
    id: `evt-${idCounter}`,
    timestamp: ts,
    timestampNs: baseNs,
    type,
    pid,
    tid,
    cpu,
    service,
    detail,
    durationUs,
    meta,
  };
}

export function fmtDur(us: number | null): string {
  if (us === null) return "—";
  if (us < 1_000) return `${us}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}

export function isSlow(us: number | null): boolean {
  return us !== null && us > 500_000;
}

export type { EventType, KernelEvent };
