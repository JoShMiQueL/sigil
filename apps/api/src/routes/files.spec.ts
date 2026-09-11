import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import { db, schema } from "@sigil/db";
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

async function createServerRecord(
  nodeId: string,
  templateId: string,
  name: string,
): Promise<string> {
  const [row] = await db
    .insert(schema.servers)
    .values({ name, nodeId, templateId, status: "running", config: {} })
    .returning();
  return row.id;
}

async function createTemplate(cookie: string | null, name: string): Promise<string> {
  const res = await apiRequest(app, "/api/admin/templates", {
    method: "POST",
    cookie,
    body: {
      name,
      tags: [],
      image: "eclipse-temurin:21-jre",
      startupCommand: "java -jar server.jar",
      resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
    },
  });
  const body = await parseJson(res);
  return body.id;
}

async function activateTemplate(cookie: string | null, templateId: string): Promise<void> {
  await apiRequest(app, `/api/admin/templates/${templateId}/activate`, {
    method: "POST",
    cookie,
  });
}

describe("file routes [R11]", () => {
  let adminCookie: string | null;
  let nodeId: string;
  let templateId: string;
  let serverId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local", "admin12345");
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
    const regionId = await createRegion("test-region");
    nodeId = await createNode(regionId, "node-01.test.local");
    await createNodeCredentials(nodeId);
    templateId = await createTemplate(adminCookie, "Paper MC");
    await activateTemplate(adminCookie, templateId);
    serverId = await createServerRecord(nodeId, templateId, "Test Server");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("GET /api/admin/servers/:serverId/files", () => {
    it("returns 404 for non-existent server", async () => {
      const res = await apiRequest(
        app,
        "/api/admin/servers/00000000-0000-4000-8000-000000000000/files",
        { method: "GET", cookie: adminCookie },
      );
      expect(res.status).toBe(404);
      const body = await parseJson(res);
      expect(body.error.code).toBe("SERVER_NOT_FOUND");
    });

    it("rejects unauthenticated requests", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/files`, {
        method: "GET",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/admin/servers/:serverId/files/read", () => {
    it("returns 400 for missing path", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/files/read`, {
        method: "GET",
        cookie: adminCookie,
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent server", async () => {
      const res = await apiRequest(
        app,
        "/api/admin/servers/00000000-0000-4000-8000-000000000000/files/read?path=test.txt",
        { method: "GET", cookie: adminCookie },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/admin/servers/:serverId/files/write", () => {
    it("returns 400 for missing path", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/files/write`, {
        method: "PUT",
        cookie: adminCookie,
        body: { content: "hello" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing content", async () => {
      const res = await apiRequest(
        app,
        `/api/admin/servers/${serverId}/files/write?path=test.txt`,
        { method: "PUT", cookie: adminCookie, body: {} },
      );
      expect(res.status).toBe(400);
    });

    it("returns 413 for content exceeding 1MB", async () => {
      const bigContent = "x".repeat(1048577);
      const res = await apiRequest(
        app,
        `/api/admin/servers/${serverId}/files/write?path=test.txt`,
        { method: "PUT", cookie: adminCookie, body: { content: bigContent } },
      );
      expect(res.status).toBe(413);
    });
  });

  describe("POST /api/admin/servers/:serverId/files/create", () => {
    it("returns 404 for non-existent server", async () => {
      const res = await apiRequest(
        app,
        "/api/admin/servers/00000000-0000-4000-8000-000000000000/files/create",
        { method: "POST", cookie: adminCookie, body: { path: "newdir", type: "directory" } },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/admin/servers/:serverId/files", () => {
    it("returns 400 for missing path", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/files`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/admin/servers/:serverId/files/rename", () => {
    it("returns 404 for non-existent server", async () => {
      const res = await apiRequest(
        app,
        "/api/admin/servers/00000000-0000-4000-8000-000000000000/files/rename",
        { method: "POST", cookie: adminCookie, body: { from: "a.txt", to: "b.txt" } },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/admin/servers/:serverId/files/upload", () => {
    it("returns 404 for non-existent server", async () => {
      const formData = new FormData();
      formData.append("file", new File(["hello"], "test.txt"));
      const res = await app.request(
        "/api/admin/servers/00000000-0000-4000-8000-000000000000/files/upload?path=.",
        {
          method: "POST",
          headers: { Cookie: adminCookie ?? "" },
          body: formData,
        },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/admin/servers/:serverId/files/download", () => {
    it("returns 400 for missing path", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/files/download`, {
        method: "GET",
        cookie: adminCookie,
      });
      expect(res.status).toBe(400);
    });
  });
});
