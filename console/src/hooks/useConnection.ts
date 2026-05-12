import { useEffect, useRef, useState, useCallback } from "react";
import type { ConnectionStatus } from "../types/events";

const WS_URL = "ws://localhost:8080/ws";
const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = 30000;
const BACKOFF_FACTOR = 2;

interface UseConnectionReturn {
  status: ConnectionStatus;
  lastMessage: MessageEvent | null;
}

export function useConnection(): UseConnectionReturn {
  if (import.meta.env.DEV) {
    return { status: "mock", lastMessage: null };
  }

  return useLiveConnection();
}

function useLiveConnection(): UseConnectionReturn {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef<number>(INITIAL_BACKOFF);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

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
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        backoffRef.current = INITIAL_BACKOFF;
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
        if (!mountedRef.current) return;
        setStatus("disconnected");
      };
    } catch {
      setStatus("disconnected");
      scheduleReconnect();
    }
  }, [scheduleReconnect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { status, lastMessage };
}
