import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import { db, schema } from "@sigilpanel/db";
import { app } from "../index";
import {
  apiRequest,
  cleanupDatabase,
  createAdmin,
  loginAndGetCookie,
  parseJson,
} from "../test/helpers";

describe("groups routes [US1: template group management]", () => {
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

  it("admin can create a group", async () => {
    const res = await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Minecraft", description: "Java and Bedrock servers" },
    });

    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.name).toBe("Minecraft");
    expect(body.description).toBe("Java and Bedrock servers");
    expect(body.id).toBeDefined();
  });

  it("admin can list groups", async () => {
    await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Minecraft" },
    });
    await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Rust" },
    });

    const res = await apiRequest(app, "/api/admin/groups", { cookie: adminCookie });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(2);
  });

  it("admin can get a group by id", async () => {
    const createRes = await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Minecraft" },
    });
    const created = await parseJson(createRes);

    const res = await apiRequest(app, `/api/admin/groups/${created.id}`, { cookie: adminCookie });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.name).toBe("Minecraft");
  });

  it("admin can edit a group name", async () => {
    const createRes = await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Minecraft" },
    });
    const created = await parseJson(createRes);

    const res = await apiRequest(app, `/api/admin/groups/${created.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { name: "Minecraft Java" },
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.name).toBe("Minecraft Java");
  });

  it("admin can delete an empty group", async () => {
    const createRes = await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Minecraft" },
    });
    const created = await parseJson(createRes);

    const res = await apiRequest(app, `/api/admin/groups/${created.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.ok).toBe(true);
  });

  it("rejects duplicate group name", async () => {
    await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Minecraft" },
    });

    const res = await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Minecraft" },
    });

    expect(res.status).toBe(409);
  });

  it("rejects deletion of group with templates", async () => {
    const createGroupRes = await apiRequest(app, "/api/admin/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Minecraft" },
    });
    const group = await parseJson(createGroupRes);

    await db.insert(schema.templates).values({
      groupId: group.id,
      name: "Paper MC",
      image: "eclipse-temurin:21-jre",
      startupCommand: "java -jar paper.jar nogui",
      resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
    });

    const res = await apiRequest(app, `/api/admin/groups/${group.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });

    expect(res.status).toBe(409);
  });

  it("rejects non-admin access", async () => {
    const res = await apiRequest(app, "/api/admin/groups", {});
    expect(res.status).toBe(403);
  });
});
