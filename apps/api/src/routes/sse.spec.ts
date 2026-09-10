import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import { app } from "../index";
import { emit, shutdownSSE } from "../services/sse.service";
import { cleanupDatabase, createAdmin, loginAndGetCookie } from "../test/helpers";

describe("SSE endpoint [US1: real-time node updates]", () => {
  let adminCookie: string | null;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local", "admin12345");
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
  });

  afterEach(async () => {
    await cleanupDatabase();
    shutdownSSE();
  });

  it("returns 401 without authentication", async () => {
    const res = await app.request("/api/sse");
    expect(res.status).toBe(401);
  });

  it("returns text/event-stream with authentication", async () => {
    const res = await app.request("/api/sse", {
      headers: adminCookie ? { Cookie: adminCookie } : {},
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();
  });

  it("delivers emitted events to connected clients", async () => {
    const res = await app.request("/api/sse", {
      headers: adminCookie ? { Cookie: adminCookie } : {},
    });
    expect(res.status).toBe(200);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let connectedReceived = false;

    const readChunk = async (): Promise<string[]> => {
      const { done, value } = await reader.read();
      if (done) return [];
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      return events;
    };

    // Read until we get the connected event
    for (let i = 0; i < 10 && !connectedReceived; i++) {
      const events = await readChunk();
      for (const evt of events) {
        if (evt.includes("event: connected")) {
          connectedReceived = true;
        }
      }
    }
    expect(connectedReceived).toBe(true);

    // Emit a test event
    emit("node.create", {
      id: "test-node-id",
      regionId: "test-region",
      regionName: "Test",
      hostname: "test.local",
      displayName: "Test",
      ipAddress: "10.0.0.1",
      capabilities: {},
      status: "unknown",
      cpuUsage: null,
      memoryUsage: null,
      diskUsage: null,
      containerCount: null,
      lastHeartbeatAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Read until we get the node.create event
    let nodeCreateReceived = false;
    for (let i = 0; i < 20 && !nodeCreateReceived; i++) {
      const events = await readChunk();
      for (const evt of events) {
        if (evt.includes("event: node.create")) {
          nodeCreateReceived = true;
        }
      }
    }
    expect(nodeCreateReceived).toBe(true);

    reader.cancel();
  });

  it("delivers region.update events to connected clients", async () => {
    const res = await app.request("/api/sse", {
      headers: adminCookie ? { Cookie: adminCookie } : {},
    });
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let buffer = "";

    const readChunk = async (): Promise<string[]> => {
      const { done, value } = await reader.read();
      if (done) return [];
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      return events;
    };

    for (let i = 0; i < 10; i++) {
      const events = await readChunk();
      if (events.some((e) => e.includes("event: connected"))) break;
    }

    emit("region.update", { id: "region-1", name: "Updated" });

    let received = false;
    for (let i = 0; i < 20 && !received; i++) {
      const events = await readChunk();
      if (events.some((e) => e.includes("event: region.update"))) received = true;
    }
    expect(received).toBe(true);
    reader.cancel();
  });

  it("delivers user.update events to connected clients", async () => {
    const res = await app.request("/api/sse", {
      headers: adminCookie ? { Cookie: adminCookie } : {},
    });
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let buffer = "";

    const readChunk = async (): Promise<string[]> => {
      const { done, value } = await reader.read();
      if (done) return [];
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      return events;
    };

    for (let i = 0; i < 10; i++) {
      const events = await readChunk();
      if (events.some((e) => e.includes("event: connected"))) break;
    }

    emit("user.update", { id: "user-1", email: "updated@test.local" });

    let received = false;
    for (let i = 0; i < 20 && !received; i++) {
      const events = await readChunk();
      if (events.some((e) => e.includes("event: user.update"))) received = true;
    }
    expect(received).toBe(true);
    reader.cancel();
  });
});
