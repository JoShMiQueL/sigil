import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import app from "../index";
import {
  apiRequest,
  cleanupDatabase,
  createAdmin,
  createNode,
  createNodeCredentials,
  createRegion,
  loginAndGetCookie,
  parseJson,
} from "../test/helpers";

describe("node management routes [US4: node lifecycle]", () => {
  let adminCookie: string | null;
  let regionId: string;
  let nodeId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local", "admin12345");
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
    regionId = await createRegion("test-region");
    nodeId = await createNode(regionId, "node-01.test.local");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("T047: admin can update node display name", async () => {
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { displayName: "My Game Node" },
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.displayName).toBe("My Game Node");
  });

  it("T047b: admin can move node to different region", async () => {
    const region2Id = await createRegion("region-2");
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { regionId: region2Id },
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.regionId).toBe(region2Id);
    expect(body.regionName).toBe("region-2");
  });

  it("T048: admin can delete a node", async () => {
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });

    expect(res.status).toBe(204);

    // Verify node is gone
    const getRes = await apiRequest(app, `/api/admin/nodes/${nodeId}`, { cookie: adminCookie });
    expect(getRes.status).toBe(404);
  });

  it("T049: admin can regenerate credentials", async () => {
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/credentials/regenerate`, {
      method: "POST",
      cookie: adminCookie,
    });

    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.secretId).toBeDefined();
    expect(body.secret).toMatch(/^sigilnode_/);
  });

  it("T050: admin can revoke credentials", async () => {
    // First create credentials
    await createNodeCredentials(nodeId);

    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/credentials/revoke`, {
      method: "POST",
      cookie: adminCookie,
    });

    expect(res.status).toBe(204);
  });

  it("T051: revoked credentials cannot authenticate", async () => {
    const creds = await createNodeCredentials(nodeId);

    // Revoke
    await apiRequest(app, `/api/admin/nodes/${nodeId}/credentials/revoke`, {
      method: "POST",
      cookie: adminCookie,
    });

    // Try to send heartbeat with revoked credentials
    const { buildNodeAuthHeaders } = await import("../test/helpers");
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      timestamp: ts,
      cpuUsage: 10,
      memoryUsage: 20,
      diskUsage: 30,
      containerCount: 1,
    });
    const headers = buildNodeAuthHeaders(creds.secretId, creds.secret, body, ts);

    const hbRes = await app.request("/api/node/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

    expect(hbRes.status).toBe(401);
  });

  it("T052: non-admin cannot manage nodes", async () => {
    const patchRes = await apiRequest(app, `/api/admin/nodes/${nodeId}`, {
      method: "PATCH",
      body: { displayName: "hacked" },
    });
    expect(patchRes.status).toBe(403);

    const deleteRes = await apiRequest(app, `/api/admin/nodes/${nodeId}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(403);
  });

  it("T053: deleting non-existent node returns 404", async () => {
    const res = await apiRequest(app, "/api/admin/nodes/00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });
});
