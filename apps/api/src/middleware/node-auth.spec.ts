import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeAuthMiddleware, type NodeAuthContext } from "./node-auth";
import {
  buildNodeAuthHeaders,
  cleanupDatabase,
  createNode,
  createNodeCredentials,
  createRegion,
  revokeNodeCredentials,
} from "../test/helpers";

// Minimal test app that uses node-auth middleware
function createTestApp() {
  const app = new Hono<NodeAuthContext>();
  app.use("/protected/*", nodeAuthMiddleware);
  app.post("/protected/heartbeat", async (c) => {
    const nodeId = c.get("nodeId");
    return c.json({ ok: true, nodeId });
  });
  return app;
}

describe("node-auth middleware", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("allows request with valid credentials", async () => {
    const app = createTestApp();
    const regionId = await createRegion();
    const nodeId = await createNode(regionId);
    const { secretId, secret } = await createNodeCredentials(nodeId);

    const body = JSON.stringify({ timestamp: Math.floor(Date.now() / 1000), cpuUsage: 50 });
    const headers = buildNodeAuthHeaders(secretId, secret, body);

    const res = await app.request("/protected/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; nodeId: string };
    expect(json.ok).toBe(true);
    expect(json.nodeId).toBe(nodeId);
  });

  it("rejects request with missing headers", async () => {
    const app = createTestApp();
    const res = await app.request("/protected/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("NODE_AUTH_FAILED");
  });

  it("rejects request with invalid signature", async () => {
    const app = createTestApp();
    const regionId = await createRegion();
    const nodeId = await createNode(regionId);
    const { secretId, secret } = await createNodeCredentials(nodeId);

    const body = JSON.stringify({ timestamp: Math.floor(Date.now() / 1000), cpuUsage: 50 });
    const headers = buildNodeAuthHeaders(secretId, secret, body);
    // Tamper with the signature
    headers["x-node-signature"] = "a".repeat(64);

    const res = await app.request("/protected/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("NODE_AUTH_FAILED");
  });

  it("rejects request with revoked credentials", async () => {
    const app = createTestApp();
    const regionId = await createRegion();
    const nodeId = await createNode(regionId);
    const { secretId, secret } = await createNodeCredentials(nodeId);
    await revokeNodeCredentials(nodeId);

    const body = JSON.stringify({ timestamp: Math.floor(Date.now() / 1000), cpuUsage: 50 });
    const headers = buildNodeAuthHeaders(secretId, secret, body);

    const res = await app.request("/protected/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("NODE_AUTH_FAILED");
  });

  it("rejects request with timestamp out of window", async () => {
    const app = createTestApp();
    const regionId = await createRegion();
    const nodeId = await createNode(regionId);
    const { secretId, secret } = await createNodeCredentials(nodeId);

    const oldTimestamp = Math.floor(Date.now() / 1000) - 120;
    const body = JSON.stringify({ timestamp: oldTimestamp, cpuUsage: 50 });
    const headers = buildNodeAuthHeaders(secretId, secret, body, oldTimestamp);

    const res = await app.request("/protected/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("TIMESTAMP_OUT_OF_WINDOW");
  });

  it("rejects request with unknown secret_id", async () => {
    const app = createTestApp();
    const body = JSON.stringify({ timestamp: Math.floor(Date.now() / 1000), cpuUsage: 50 });
    const headers = buildNodeAuthHeaders("unknown-id", "fake-secret", body);

    const res = await app.request("/protected/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("NODE_AUTH_FAILED");
  });
});
