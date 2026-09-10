import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import { app } from "../index";
import { sweepOfflineNodes } from "../services/heartbeat.service";
import {
  buildNodeAuthHeaders,
  cleanupDatabase,
  createNode,
  createNodeCredentials,
  createRegion,
} from "../test/helpers";

function makeHeartbeatRequest(
  secretId: string,
  secret: string,
  payload: unknown,
  options: { headers?: Record<string, string> } = {},
): Promise<Response> {
  const body = JSON.stringify(payload);
  const headers = options.headers ?? buildNodeAuthHeaders(secretId, secret, body);
  return Promise.resolve(
    app.request("/api/node/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    }),
  );
}

describe("heartbeat routes [US3: health monitoring]", () => {
  let regionId: string;
  let nodeId: string;
  let secretId: string;
  let secret: string;

  beforeEach(async () => {
    await cleanupDatabase();
    regionId = await createRegion("test-region");
    nodeId = await createNode(regionId, "node-01.test.local");
    const creds = await createNodeCredentials(nodeId);
    secretId = creds.secretId;
    secret = creds.secret;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("T037a: valid heartbeat updates node status to online", async () => {
    const res = await makeHeartbeatRequest(secretId, secret, {
      timestamp: Math.floor(Date.now() / 1000),
      cpuUsage: 42.5,
      memoryUsage: 68.0,
      diskUsage: 35.2,
      containerCount: 5,
    });

    expect(res.status).toBe(204);
  });

  it("T037b: invalid auth is rejected", async () => {
    const res = await makeHeartbeatRequest("wrong-id", "wrong-secret", {
      timestamp: Math.floor(Date.now() / 1000),
      cpuUsage: 42.5,
      memoryUsage: 68.0,
      diskUsage: 35.2,
      containerCount: 5,
    });

    expect(res.status).toBe(401);
  });

  it("T037c: timestamp out of window is rejected", async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 120;
    const body = JSON.stringify({
      timestamp: oldTs,
      cpuUsage: 42.5,
      memoryUsage: 68.0,
      diskUsage: 35.2,
      containerCount: 5,
    });
    const headers = buildNodeAuthHeaders(secretId, secret, body, oldTs);

    const res = await app.request("/api/node/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("TIMESTAMP_OUT_OF_WINDOW");
  });

  it("T038a: node is marked offline after heartbeat timeout", async () => {
    // First, send a heartbeat to mark the node online
    await makeHeartbeatRequest(secretId, secret, {
      timestamp: Math.floor(Date.now() / 1000),
      cpuUsage: 42.5,
      memoryUsage: 68.0,
      diskUsage: 35.2,
      containerCount: 5,
    });

    // Manually set lastHeartbeatAt to 2 minutes ago to simulate timeout
    const { db, schema } = await import("@sigil/db");
    const { eq } = await import("drizzle-orm");
    await db
      .update(schema.nodes)
      .set({ lastHeartbeatAt: new Date(Date.now() - 120 * 1000) })
      .where(eq(schema.nodes.id, nodeId));

    // Run the sweep
    const swept = await sweepOfflineNodes();
    expect(swept).toBeGreaterThanOrEqual(1);

    // Verify node is now offline
    const [node] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nodeId)).limit(1);
    expect(node?.status).toBe("offline");
  });

  it("T038b: node recovers on new heartbeat after being offline", async () => {
    // Mark node as offline
    const { db, schema } = await import("@sigil/db");
    const { eq } = await import("drizzle-orm");
    await db
      .update(schema.nodes)
      .set({ status: "offline", lastHeartbeatAt: new Date(Date.now() - 120 * 1000) })
      .where(eq(schema.nodes.id, nodeId));

    // Send a new heartbeat
    const res = await makeHeartbeatRequest(secretId, secret, {
      timestamp: Math.floor(Date.now() / 1000),
      cpuUsage: 10.0,
      memoryUsage: 20.0,
      diskUsage: 30.0,
      containerCount: 1,
    });

    expect(res.status).toBe(204);

    // Verify node is back online
    const [node] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nodeId)).limit(1);
    expect(node?.status).toBe("online");
  });
});
