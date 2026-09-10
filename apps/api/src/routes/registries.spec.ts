import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import { app } from "../index";
import { apiRequest, cleanupDatabase, createAdmin, loginAndGetCookie, parseJson } from "../test/helpers";

describe("registries routes [US2: registry management]", () => {
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

  it("admin can create a registry", async () => {
    const res = await apiRequest(app, "/api/admin/registries", {
      method: "POST",
      cookie: adminCookie,
      body: {
        url: "https://example.com/registry",
        name: "Community",
        authMethod: "none",
      },
    });

    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.name).toBe("Community");
    expect(body.url).toBe("https://example.com/registry");
    expect(body.hasCredentials).toBe(false);
    expect(body.isOfficial).toBe(false);
  });

  it("admin can list registries", async () => {
    await apiRequest(app, "/api/admin/registries", {
      method: "POST",
      cookie: adminCookie,
      body: { url: "https://example.com/registry", name: "Community" },
    });

    const res = await apiRequest(app, "/api/admin/registries", { cookie: adminCookie });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Community");
  });

  it("admin can delete a registry", async () => {
    const createRes = await apiRequest(app, "/api/admin/registries", {
      method: "POST",
      cookie: adminCookie,
      body: { url: "https://example.com/registry", name: "Community" },
    });
    const created = await parseJson(createRes);

    const res = await apiRequest(app, `/api/admin/registries/${created.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });

    expect(res.status).toBe(200);
  });

  it("rejects duplicate registry name", async () => {
    await apiRequest(app, "/api/admin/registries", {
      method: "POST",
      cookie: adminCookie,
      body: { url: "https://example.com/registry", name: "Community" },
    });

    const res = await apiRequest(app, "/api/admin/registries", {
      method: "POST",
      cookie: adminCookie,
      body: { url: "https://example.com/other", name: "Community" },
    });

    expect(res.status).toBe(409);
  });

  it("credentials are not returned in response", async () => {
    const res = await apiRequest(app, "/api/admin/registries", {
      method: "POST",
      cookie: adminCookie,
      body: {
        url: "https://example.com/registry",
        name: "Private",
        authMethod: "token",
        token: "secret-token-123",
      },
    });

    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.hasCredentials).toBe(true);
    expect(body.token).toBeUndefined();
    expect(body.password).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("secret-token-123");
  });

  it("rejects non-admin access", async () => {
    const res = await apiRequest(app, "/api/admin/registries", {});
    expect(res.status).toBe(403);
  });
});
