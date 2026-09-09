import type { SSEEventType } from "@sigilpanel/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type SSEConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface UseSSEOptions {
  invalidations?: Partial<Record<SSEEventType, string[][]>>;
  handlers?: Partial<Record<SSEEventType, (payload: unknown) => void>>;
  onConnectionStateChange?: (state: SSEConnectionState) => void;
}

export interface UseSSEReturn {
  connectionState: SSEConnectionState;
  reconnect: () => void;
}

const BACKOFF_SEQUENCE = [1000, 2000, 4000, 8000, 30000];
const MAX_ATTEMPTS = 5;

type Listener = (payload: unknown) => void;

let eventSource: EventSource | null = null;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectionState: SSEConnectionState = "connecting";

const listenersByType = new Map<SSEEventType, Set<Listener>>();
const stateListeners = new Set<(state: SSEConnectionState) => void>();

function setState(state: SSEConnectionState): void {
  connectionState = state;
  for (const listener of stateListeners) {
    try {
      listener(state);
    } catch (err) {
      console.error("SSE state listener error:", err);
    }
  }
}

function dispatchEvent(type: SSEEventType, payload: unknown): void {
  const listeners = listenersByType.get(type);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error(`SSE handler error for ${type}:`, err);
    }
  }
}

function addListener(type: SSEEventType, listener: Listener): void {
  if (!listenersByType.has(type)) listenersByType.set(type, new Set());
  listenersByType.get(type)!.add(listener);
}

function removeListener(type: SSEEventType, listener: Listener): void {
  listenersByType.get(type)?.delete(listener);
}

function connect(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  const es = new EventSource(`${API_URL}/api/sse`, { withCredentials: true });
  eventSource = es;

  es.onopen = () => {
    attempt = 0;
    setState("connected");
  };

  es.onerror = () => {
    es.close();
    eventSource = null;

    if (attempt >= MAX_ATTEMPTS) {
      setState("disconnected");
      return;
    }

    setState("reconnecting");
    const delay = BACKOFF_SEQUENCE[Math.min(attempt, BACKOFF_SEQUENCE.length - 1)];
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  const eventTypes: SSEEventType[] = [
    "node.update",
    "node.create",
    "node.delete",
    "region.update",
    "user.update",
    "connected",
  ];

  for (const type of eventTypes) {
    es.addEventListener(type, (e: MessageEvent) => {
      let payload: unknown;
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }
      if (type !== "connected") dispatchEvent(type, payload);
    });
  }
}

function ensureConnection(): void {
  if (!eventSource && connectionState !== "disconnected") {
    connect();
  }
}

function reconnectAll(): void {
  attempt = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  connect();
}

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const queryClient = useQueryClient();
  const [state, setLocalState] = useState<SSEConnectionState>(connectionState);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const stateListener = (newState: SSEConnectionState) => {
      setLocalState(newState);
      optionsRef.current.onConnectionStateChange?.(newState);
    };
    stateListeners.add(stateListener);

    const registeredListeners: Array<[SSEEventType, Listener]> = [];

    if (optionsRef.current.invalidations) {
      for (const [type, keys] of Object.entries(optionsRef.current.invalidations) as Array<
        [SSEEventType, string[][]]
      >) {
        const listener: Listener = () => {
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        };
        addListener(type, listener);
        registeredListeners.push([type, listener]);
      }
    }

    if (optionsRef.current.handlers) {
      for (const [type, handler] of Object.entries(optionsRef.current.handlers) as Array<
        [SSEEventType, Listener]
      >) {
        addListener(type, handler);
        registeredListeners.push([type, handler]);
      }
    }

    ensureConnection();

    return () => {
      stateListeners.delete(stateListener);
      for (const [type, listener] of registeredListeners) {
        removeListener(type, listener);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connectionState: state, reconnect: reconnectAll };
}
