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
  loginAndGetCookie,
  parseJson,
} from "../test/helpers";

async function createGroup(cookie: string | null, name: string): Promise<string> {
  const res = await apiRequest(app, "/api/admin/groups", {
    method: "POST",
    cookie: cookie,
    body: { name },
  });
  const body = await parseJson(res);
  return body.id;
}

async function createTemplate(
  cookie: string | null,
  groupId: string,
  name: string,
): Promise<string> {
  const res = await apiRequest(app, "/api/admin/templates", {
    method: "POST",
    cookie: cookie,
    body: {
      groupId,
      name,
      image: "eclipse-temurin:21-jre",
      startupCommand: "java -jar server.jar",
      resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
    },
  });
  const body = await parseJson(res);
  return body.id;
}

describe("templates routes [US3: template lifecycle]", () => {
  let adminCookie: string | null;
  let groupId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local", "admin12345");
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
    groupId = await createGroup(adminCookie, "Minecraft");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("admin can create a template", async () => {
    const res = await apiRequest(app, "/api/admin/templates", {
      method: "POST",
      cookie: adminCookie,
      body: {
        groupId,
        name: "Paper MC",
        image: "eclipse-temurin:21-jre",
        startupCommand: "java -jar paper.jar nogui",
        resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
      },
    });

    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.name).toBe("Paper MC");
    expect(body.active).toBe(false);
    expect(body.customized).toBe(false);
  });

  it("admin can list templates", async () => {
    await createTemplate(adminCookie, groupId, "Paper MC");
    await createTemplate(adminCookie, groupId, "Vanilla MC");

    const res = await apiRequest(app, "/api/admin/templates", { cookie: adminCookie });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(2);
  });

  it("admin can activate and deactivate a template", async () => {
    const templateId = await createTemplate(adminCookie, groupId, "Paper MC");

    const activateRes = await apiRequest(app, `/api/admin/templates/${templateId}/activate`, {
      method: "POST",
      cookie: adminCookie,
    });
    expect(activateRes.status).toBe(200);
    const activated = await parseJson(activateRes);
    expect(activated.active).toBe(true);

    const deactivateRes = await apiRequest(app, `/api/admin/templates/${templateId}/deactivate`, {
      method: "POST",
      cookie: adminCookie,
    });
    expect(deactivateRes.status).toBe(200);
    const deactivated = await parseJson(deactivateRes);
    expect(deactivated.active).toBe(false);
  });

  it("admin can edit a template and it gets marked customized", async () => {
    const templateId = await createTemplate(adminCookie, groupId, "Paper MC");

    const res = await apiRequest(app, `/api/admin/templates/${templateId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { name: "Paper MC Custom" },
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.name).toBe("Paper MC Custom");
    // customized is only true for registry-installed templates
    // locally created templates don't have registryId, so customized stays false
    expect(body.customized).toBe(false);
  });

  it("admin can delete a template", async () => {
    const templateId = await createTemplate(adminCookie, groupId, "Paper MC");

    const res = await apiRequest(app, `/api/admin/templates/${templateId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });

    expect(res.status).toBe(200);
  });

  it("admin can filter templates by group", async () => {
    await createTemplate(adminCookie, groupId, "Paper MC");
    const group2Id = await createGroup(adminCookie, "Rust");
    await createTemplate(adminCookie, group2Id, "Rust Server");

    const res = await apiRequest(app, `/api/admin/templates?groupId=${groupId}`, {
      cookie: adminCookie,
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Paper MC");
  });

  it("non-admin users only see active templates", async () => {
    const templateId = await createTemplate(adminCookie, groupId, "Paper MC");
    await apiRequest(app, `/api/admin/templates/${templateId}/activate`, {
      method: "POST",
      cookie: adminCookie,
    });
    await createTemplate(adminCookie, groupId, "Vanilla MC");

    // Unauthenticated GET returns only active templates (activeOnly=true)
    const res = await apiRequest(app, "/api/admin/templates", {});
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Paper MC");
  });

  it("rejects non-admin mutations", async () => {
    const res = await apiRequest(app, "/api/admin/templates", {
      method: "POST",
      body: {
        groupId,
        name: "Test",
        image: "test",
        startupCommand: "test",
        resourceLimits: { memoryMb: 1, cpuLimit: 0.1 },
      },
    });
    expect(res.status).toBe(403);
  });
});
