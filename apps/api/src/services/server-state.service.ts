import type { StateChangeEvent } from "@sigil/shared";

type ServerStateListener = (event: StateChangeEvent) => void;

const listeners = new Set<ServerStateListener>();

export function addServerStateListener(fn: ServerStateListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitServerStateEvent(event: StateChangeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("server state listener error:", err);
    }
  }
}
