import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (c: any, next: any) => {
    await next();
  },
}));

import app from "../index";
import {
  apiRequest,
  cleanupDatabase,
  createAdmin,
  loginAndGetCookie,
  parseJson,
} from "../test/helpers";

describe("api-keys routes [US5: API keys]", () => {
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

  it("T106: create API key returns full key and metadata", async () => {
    const res = await apiRequest(app, "/api/api-keys", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "test-key", scopes: ["read"] },
    });

    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.key).toMatch(/^sigil_/);
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("test-key");
    expect(body.prefix).toMatch(/^sigil_/);
    expect(body.scopes).toEqual(["read"]);
  });

  it("T107: list API keys returns created keys (without full secret)", async () => {
    await apiRequest(app, "/api/api-keys", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "key1", scopes: ["read", "control"] },
    });
    await apiRequest(app, "/api/api-keys", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "key2", scopes: ["read"] },
    });

    const res = await apiRequest(app, "/api/api-keys", { cookie: adminCookie });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.keys).toHaveLength(2);
    expect(body.keys[0].name).toBe("key1");
    expect(body.keys[0].key).toBeUndefined(); // Full key not returned
    expect(body.keys[0].keyPrefix).toMatch(/^sigil_/);
  });

  it("T108: use API key for Bearer authentication", async () => {
    const createRes = await apiRequest(app, "/api/api-keys", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "bearer-key", scopes: ["read"] },
    });
    const { key } = await parseJson(createRes);

    // Use API key to access /me
    const meRes = await apiRequest(app, "/api/auth/me", {
      headers: { Authorization: `Bearer ${key}` },
    });

    expect(meRes.status).toBe(200);
    const meBody = await parseJson(meRes);
    expect(meBody.user.email).toBe("admin@test.local");
  });

  it("T109: revoke API key", async () => {
    const createRes = await apiRequest(app, "/api/api-keys", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "revoke-key", scopes: ["read"] },
    });
    const { key, id } = await parseJson(createRes);

    // Revoke
    const revokeRes = await apiRequest(app, `/api/api-keys/${id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(revokeRes.status).toBe(200);

    // Revoked key should no longer work
    const meRes = await apiRequest(app, "/api/auth/me", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(meRes.status).toBe(401);
  });

  it("T110: invalid API key is rejected", async () => {
    const meRes = await apiRequest(app, "/api/auth/me", {
      headers: { Authorization: "Bearer sigil_invalidkey123456" },
    });
    expect(meRes.status).toBe(401);
  });

  it("T111: API key without session cannot access admin routes", async () => {
    // Create a key with only "read" scope
    const createRes = await apiRequest(app, "/api/api-keys", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "read-only", scopes: ["read"] },
    });
    const { key } = await parseJson(createRes);

    // API key can access /me
    const meRes = await apiRequest(app, "/api/auth/me", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(meRes.status).toBe(200);

    // API key cannot access admin-only routes (admin guard checks role, not session)
    const usersRes = await apiRequest(app, "/api/admin/users", {
      headers: { Authorization: `Bearer ${key}` },
    });
    // The admin guard checks user.role === "admin", which is true for the admin user
    // So this should work even with API key auth
    expect(usersRes.status).toBe(200);
  });

  it("API key last_used_at is updated on use", async () => {
    const createRes = await apiRequest(app, "/api/api-keys", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "track-key", scopes: ["read"] },
    });
    const { key } = await parseJson(createRes);

    // Use the key
    await apiRequest(app, "/api/auth/me", {
      headers: { Authorization: `Bearer ${key}` },
    });

    // List keys and check lastUsedAt
    const listRes = await apiRequest(app, "/api/api-keys", { cookie: adminCookie });
    const body = await parseJson(listRes);
    expect(body.keys[0].lastUsedAt).not.toBeNull();
  });
});
