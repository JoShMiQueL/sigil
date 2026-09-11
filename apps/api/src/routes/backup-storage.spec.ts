import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import { app } from "../index";
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

describe("backup storage config routes [R12]", () => {
  let adminCookie: string | null;
  let nodeId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin();
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
    const regionId = await createRegion("test-region");
    nodeId = await createNode(regionId, "storage-node");
    await createNodeCredentials(nodeId);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("gets default storage config for a node", async () => {
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/backup-storage`, {
      method: "GET",
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.backend).toBe("local");
    expect(body.maxBackupSizeGb).toBe(10);
  });

  it("returns 404 for non-existent node", async () => {
    const res = await apiRequest(
      app,
      "/api/admin/nodes/00000000-0000-0000-0000-000000000000/backup-storage",
      {
        method: "GET",
        cookie: adminCookie,
      },
    );
    expect(res.status).toBe(404);
  });

  it("updates storage config to local", async () => {
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/backup-storage`, {
      method: "PUT",
      cookie: adminCookie,
      body: { backend: "local", maxBackupSizeGb: 20 },
    });
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.backend).toBe("local");
    expect(body.maxBackupSizeGb).toBe(20);
  });

  it("rejects invalid S3 config (missing fields)", async () => {
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/backup-storage`, {
      method: "PUT",
      cookie: adminCookie,
      body: { backend: "s3", s3Endpoint: "http://localhost:9000" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin user", async () => {
    const { createUser } = await import("../test/helpers");
    await createUser("user@test.local", "user12345");
    const result = await loginAndGetCookie(app, "user@test.local", "user12345");
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/backup-storage`, {
      method: "GET",
      cookie: result.cookie,
    });
    expect(res.status).toBe(403);
  });

  it("test endpoint returns ok for local backend", async () => {
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/backup-storage/test`, {
      method: "POST",
      cookie: adminCookie,
      body: { backend: "local" },
    });
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.ok).toBe(true);
  });

  it("test endpoint rejects invalid S3 config", async () => {
    const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/backup-storage/test`, {
      method: "POST",
      cookie: adminCookie,
      body: { backend: "s3", s3Endpoint: "http://localhost:9000" },
    });
    expect(res.status).toBe(400);
  });
});
