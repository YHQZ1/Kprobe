import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getToken } from "../lib/auth";
import type { ConnectionStatus } from "../types/events";

const getWsUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
};

const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = 30000;
const BACKOFF_FACTOR = 2;
const MAX_MESSAGES = 2000;

export interface ConnectionMessage {
  id: number;
  data: string;
}

interface ConnectionContextValue {
  status: ConnectionStatus;
  messages: ConnectionMessage[];
  clearMessages: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

function eventKey(data: string): string {
  try {
    const event = JSON.parse(data);
    return [
      event.timestampNs ?? event.timestamp_ns ?? "",
      event.eventType ?? event.event_type ?? "",
      event.pid ?? "",
      event.tid ?? "",
      event.cpu ?? "",
      event.transactionId ?? event.transaction_id ?? "",
      event.serviceName ?? event.service_name ?? "",
      event.traceId ?? event.trace_id ?? "",
      event.spanId ?? event.span_id ?? "",
      event.durationNs ?? event.duration_ns ?? "",
    ].join(":");
  } catch {
    return data;
  }
}

function eventTimestamp(data: string): number {
  try {
    const event = JSON.parse(data);
    return Number(event.timestampNs ?? event.timestamp_ns ?? 0);
  } catch {
    return 0;
  }
}

export function ConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [messages, setMessages] = useState<ConnectionMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const sequenceRef = useRef(0);
  const hydratedRef = useRef(false);
  const bufferedLiveRef = useRef<string[]>([]);
  const seenEventKeysRef = useRef(new Set<string>());
  const lifecycleRef = useRef(0);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = backoffRef.current;
    backoffRef.current = Math.min(
      backoffRef.current * BACKOFF_FACTOR,
      MAX_BACKOFF,
    );
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    setStatus("connecting");

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        backoffRef.current = INITIAL_BACKOFF;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        const data = String(event.data);
        if (!hydratedRef.current) {
          bufferedLiveRef.current.push(data);
          return;
        }

        const key = eventKey(data);
        if (seenEventKeysRef.current.has(key)) return;
        seenEventKeysRef.current.add(key);
        setMessages((current) => {
          const next = [
            ...current,
            { id: ++sequenceRef.current, data },
          ].slice(-MAX_MESSAGES);
          seenEventKeysRef.current = new Set(
            next.map((message) => eventKey(message.data)),
          );
          return next;
        });
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");
      };
    } catch {
      setStatus("disconnected");
      scheduleReconnect();
    }
  }, [scheduleReconnect]);

  const hydrateHistory = useCallback(async (lifecycle: number) => {
    let historical: string[] = [];
    const token = getToken();

    if (token) {
      try {
        const response = await fetch(`/api/events?limit=${MAX_MESSAGES}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const body = await response.json();
          if (Array.isArray(body.events)) {
            historical = body.events.map((event: unknown) =>
              JSON.stringify(event),
            );
          }
        }
      } catch {
        // Live streaming remains available when historical storage is offline.
      }
    }

    if (!mountedRef.current || lifecycle !== lifecycleRef.current) return;

    const combined = [...historical, ...bufferedLiveRef.current];
    bufferedLiveRef.current = [];
    const unique = new Map<string, string>();
    for (const data of combined) unique.set(eventKey(data), data);

    const ordered = [...unique.values()]
      .sort((left, right) => eventTimestamp(left) - eventTimestamp(right))
      .slice(-MAX_MESSAGES);

    seenEventKeysRef.current = new Set(ordered.map(eventKey));
    const hydrated = ordered.map((data) => ({
      id: ++sequenceRef.current,
      data,
    }));
    hydratedRef.current = true;
    setMessages(hydrated);
  }, []);

  useEffect(() => {
    const lifecycle = ++lifecycleRef.current;
    mountedRef.current = true;
    connect();
    void hydrateHistory(lifecycle);

    return () => {
      mountedRef.current = false;
      lifecycleRef.current++;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect, hydrateHistory]);

  return (
    <ConnectionContext.Provider value={{ status, messages, clearMessages }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const value = useContext(ConnectionContext);
  if (!value) {
    throw new Error("useConnection must be used inside ConnectionProvider");
  }
  return value;
}
