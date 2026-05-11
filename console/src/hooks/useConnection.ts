import { useEffect, useRef, useState, useCallback } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const WS_URL = "ws://localhost:8080/ws";
const INITIAL_BACKOFF = 1000; // 1s
const MAX_BACKOFF = 30000; // 30s
const BACKOFF_FACTOR = 2;

interface UseConnectionReturn {
  status: ConnectionStatus;
  ws: WebSocket | null;
  lastMessage: MessageEvent | null;
}

export function useConnection(): UseConnectionReturn {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef<number>(INITIAL_BACKOFF);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setStatus("connecting");

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        backoffRef.current = INITIAL_BACKOFF; // reset on success
      };

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return;
        setLastMessage(evt);
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose fires after onerror — let that handle reconnect
        if (!mountedRef.current) return;
        setStatus("disconnected");
      };
    } catch {
      setStatus("disconnected");
      scheduleReconnect();
    }
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
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect loop on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    status,
    ws: wsRef.current,
    lastMessage,
  };
}
