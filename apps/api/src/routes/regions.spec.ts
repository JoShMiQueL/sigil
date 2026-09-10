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
  createRegion,
  loginAndGetCookie,
  parseJson,
} from "../test/helpers";

describe("regions routes [US1: region management]", () => {
  let adminCookie: string | null;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local", "admin12345");
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("T018a: admin can create a region", async () => {
    const res = await apiRequest(app, "/api/admin/regions", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "EU-West", description: "European servers" },
    });

    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.name).toBe("EU-West");
    expect(body.description).toBe("European servers");
    expect(body.id).toBeDefined();
  });

  it("T018b: admin can list regions with node counts", async () => {
    const regionId = await createRegion("EU-West");
    await createNode(regionId, "node-01.test.local");

    const res = await apiRequest(app, "/api/admin/regions", { cookie: adminCookie });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("EU-West");
    expect(body[0].nodeCount).toBe(1);
    expect(body[0].serverCount).toBe(0);
  });

  it("T018c: duplicate region name returns 409", async () => {
    await createRegion("EU-West");

    const res = await apiRequest(app, "/api/admin/regions", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "EU-West" },
    });

    expect(res.status).toBe(409);
    const body = await parseJson(res);
    expect(body.error.code).toBe("REGION_NAME_EXISTS");
  });

  it("T018d: admin can delete a region with no nodes", async () => {
    const regionId = await createRegion("EU-West");

    const res = await apiRequest(app, `/api/admin/regions/${regionId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });

    expect(res.status).toBe(204);
  });

  it("T018e: cannot delete a region with nodes", async () => {
    const regionId = await createRegion("EU-West");
    await createNode(regionId, "node-01.test.local");

    const res = await apiRequest(app, `/api/admin/regions/${regionId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });

    expect(res.status).toBe(409);
    const body = await parseJson(res);
    expect(body.error.code).toBe("REGION_HAS_NODES");
  });

  it("T018f: non-admin cannot access regions", async () => {
    const res = await apiRequest(app, "/api/admin/regions");
    expect(res.status).toBe(403);
  });
});
