import type { DaemonToBrowserMessage } from "@sigil/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type ConsoleConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

interface UseConsoleOptions {
  daemonUrl: string | undefined;
  token: string | undefined;
  enabled: boolean;
}

const MAX_BACKOFF = 30000;
const MAX_LINES = 10000;

export function useConsole({ daemonUrl, token, enabled }: UseConsoleOptions) {
  const [messages, setMessages] = useState<DaemonToBrowserMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConsoleConnectionState>("disconnected");
  const [stats, setStats] = useState<{
    cpuPct: number;
    memoryMb: number;
    memoryLimitMb: number;
    diskMb: number;
    diskLimitMb: number;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!daemonUrl || !token || !enabled) return;
    if (!mountedRef.current) return;

    setConnectionState("connecting");

    const ws = new WebSocket(`${daemonUrl}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState("connected");
      backoffRef.current = 1000; // reset backoff on successful connection
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string) as DaemonToBrowserMessage;
        if (msg.type === "output") {
          setMessages((prev) => {
            const next = [...prev, msg];
            if (next.length > MAX_LINES) {
              return next.slice(next.length - MAX_LINES);
            }
            return next;
          });
        } else if (msg.type === "stats") {
          setStats({
            cpuPct: msg.cpuPct,
            memoryMb: msg.memoryMb,
            memoryLimitMb: msg.memoryLimitMb,
            diskMb: msg.diskMb,
            diskLimitMb: msg.diskLimitMb,
          });
        } else if (msg.type === "error") {
          // Error messages are added to the output stream
          setMessages((prev) => [...prev, msg]);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      wsRef.current = null;

      if (event.code === 1000) {
        // Normal close — server stopped
        setConnectionState("disconnected");
        return;
      }

      // Unexpected close — try to reconnect with backoff
      setConnectionState("reconnecting");
      const backoff = backoffRef.current;
      backoffRef.current = Math.min(backoff * 2, MAX_BACKOFF);

      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current && enabled) {
          connect();
        }
      }, backoff);
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setConnectionState("error");
    };
  }, [daemonUrl, token, enabled]);

  useEffect(() => {
    mountedRef.current = true;

    if (enabled && daemonUrl && token) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "component unmount");
        wsRef.current = null;
      }
    };
  }, [enabled, daemonUrl, token, connect]);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "command", text }));
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    connectionState,
    stats,
    sendMessage,
    clearMessages,
  };
}
