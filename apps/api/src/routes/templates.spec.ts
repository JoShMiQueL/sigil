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

async function createTemplate(
  cookie: string | null,
  name: string,
  tags: string[] = [],
): Promise<string> {
  const res = await apiRequest(app, "/api/admin/templates", {
    method: "POST",
    cookie: cookie,
    body: {
      name,
      tags,
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

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local", "admin12345");
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("admin can create a template with tags", async () => {
    const res = await apiRequest(app, "/api/admin/templates", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: "Paper MC",
        tags: ["minecraft", "java", "paper"],
        image: "eclipse-temurin:21-jre",
        startupCommand: "java -jar paper.jar nogui",
        resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
      },
    });

    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.name).toBe("Paper MC");
    expect(body.tags).toEqual(["minecraft", "java", "paper"]);
    expect(body.active).toBe(false);
    expect(body.customized).toBe(false);
  });

  it("admin can list templates", async () => {
    await createTemplate(adminCookie, "Paper MC", ["minecraft"]);
    await createTemplate(adminCookie, "Vanilla MC", ["minecraft"]);

    const res = await apiRequest(app, "/api/admin/templates", { cookie: adminCookie });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(2);
  });

  it("admin can activate and deactivate a template", async () => {
    const templateId = await createTemplate(adminCookie, "Paper MC", ["minecraft"]);

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

  it("admin can edit a template and its tags", async () => {
    const templateId = await createTemplate(adminCookie, "Paper MC", ["minecraft"]);

    const res = await apiRequest(app, `/api/admin/templates/${templateId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { name: "Paper MC Custom", tags: ["minecraft", "custom"] },
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.name).toBe("Paper MC Custom");
    expect(body.tags).toEqual(["minecraft", "custom"]);
    expect(body.customized).toBe(false);
  });

  it("admin can delete a template", async () => {
    const templateId = await createTemplate(adminCookie, "Paper MC", ["minecraft"]);

    const res = await apiRequest(app, `/api/admin/templates/${templateId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });

    expect(res.status).toBe(200);
  });

  it("admin can filter templates by tag", async () => {
    await createTemplate(adminCookie, "Paper MC", ["minecraft", "java"]);
    await createTemplate(adminCookie, "Rust Server", ["rust", "steamcmd"]);

    const res = await apiRequest(app, "/api/admin/templates?tag=minecraft", {
      cookie: adminCookie,
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Paper MC");
  });

  it("non-admin users only see active templates", async () => {
    const templateId = await createTemplate(adminCookie, "Paper MC", ["minecraft"]);
    await apiRequest(app, `/api/admin/templates/${templateId}/activate`, {
      method: "POST",
      cookie: adminCookie,
    });
    await createTemplate(adminCookie, "Vanilla MC", ["minecraft"]);

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
        name: "Test",
        tags: [],
        image: "test",
        startupCommand: "test",
        resourceLimits: { memoryMb: 1, cpuLimit: 0.1 },
      },
    });
    expect(res.status).toBe(403);
  });
});
