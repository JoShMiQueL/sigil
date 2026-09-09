import { randomUUID } from "node:crypto";
import type { SSEEventType } from "@sigilpanel/shared";
import Redis from "ioredis";

export type SSESubscriber = {
  id: string;
  userId: string;
  role: "admin" | "user";
  send: (event: { type: SSEEventType; payload: unknown; timestamp: string }) => void;
  close: () => void;
};

const subscribers = new Map<string, SSESubscriber>();

const NODE_DEBOUNCE_MS = 1000;
const nodeDebounceTimers = new Map<string, NodeJS.Timeout>();
const nodePendingPayloads = new Map<string, unknown>();

let redisPub: Redis | null = null;
let redisSub: Redis | null = null;
let pubSubStarted = false;

const REDIS_CHANNEL = "sigil:sse:events";

function getRedisPub(): Redis | null {
  if (process.env.NODE_ENV === "test") return null;
  if (!redisPub) {
    redisPub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }
  return redisPub;
}

function startPubSub(): void {
  if (pubSubStarted || process.env.NODE_ENV === "test") return;
  pubSubStarted = true;

  redisSub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  redisSub.subscribe(REDIS_CHANNEL, (err) => {
    if (err) console.error("SSE Redis subscribe failed:", err);
  });
  redisSub.on("message", (_channel, message) => {
    try {
      const event = JSON.parse(message) as SSEEventInternal;
      fanoutLocal(event);
    } catch (err) {
      console.error("SSE Redis message parse failed:", err);
    }
  });
}

type SSEEventInternal = { type: SSEEventType; payload: unknown; timestamp: string };

function fanoutLocal(event: SSEEventInternal): void {
  for (const sub of subscribers.values()) {
    if (sub.role !== "admin") continue;
    sub.send(event);
  }
}

export function addSubscriber(sub: Omit<SSESubscriber, "id">): SSESubscriber {
  const subscriber: SSESubscriber = { ...sub, id: randomUUID() };
  subscribers.set(subscriber.id, subscriber);
  startPubSub();
  return subscriber;
}

export function removeSubscriber(id: string): void {
  const sub = subscribers.get(id);
  if (sub) {
    subscribers.delete(id);
  }
}

export function getSubscriberCount(): number {
  return subscribers.size;
}

export function emit(type: SSEEventType, payload: unknown): void {
  if (type === "node.update" && typeof payload === "object" && payload && "id" in payload) {
    const nodeId = (payload as { id: string }).id;
    const existing = nodeDebounceTimers.get(nodeId);
    nodePendingPayloads.set(nodeId, payload);
    if (existing) return;
    const timer = setTimeout(() => {
      const pending = nodePendingPayloads.get(nodeId);
      nodePendingPayloads.delete(nodeId);
      nodeDebounceTimers.delete(nodeId);
      if (pending) publishEvent("node.update", pending);
    }, NODE_DEBOUNCE_MS);
    nodeDebounceTimers.set(nodeId, timer);
    return;
  }
  publishEvent(type, payload);
}

function publishEvent(type: SSEEventType, payload: unknown): void {
  const event: SSEEventInternal = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };

  fanoutLocal(event);

  const pub = getRedisPub();
  if (pub) {
    pub.publish(REDIS_CHANNEL, JSON.stringify(event)).catch((err) => {
      console.error("SSE Redis publish failed:", err);
    });
  }
}

export function shutdownSSE(): void {
  for (const timer of nodeDebounceTimers.values()) clearTimeout(timer);
  nodeDebounceTimers.clear();
  nodePendingPayloads.clear();
  for (const sub of subscribers.values()) sub.close();
  subscribers.clear();
  redisPub?.disconnect();
  redisSub?.disconnect();
  redisPub = null;
  redisSub = null;
  pubSubStarted = false;
}
