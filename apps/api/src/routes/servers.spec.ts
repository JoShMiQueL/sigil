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

async function createTemplate(cookie: string | null, name: string): Promise<string> {
  const res = await apiRequest(app, "/api/admin/templates", {
    method: "POST",
    cookie: cookie,
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
    cookie: cookie,
  });
}

describe("server routes [R9]", () => {
  let adminCookie: string | null;
  let nodeId: string;
  let templateId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local", "admin12345");
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
    const regionId = await createRegion("test-region");
    nodeId = await createNode(regionId, "node-01.test.local");
    templateId = await createTemplate(adminCookie, "Paper MC");
    await activateTemplate(adminCookie, templateId);

    // Add allocations to the node
    await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
      method: "POST",
      cookie: adminCookie,
      body: { ip: "203.0.113.10", portStart: 25565, portEnd: 25575, protocol: "tcp" },
    });
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("POST /api/admin/servers", () => {
    it("rejects when template is inactive", async () => {
      // Deactivate the template
      await apiRequest(app, `/api/admin/templates/${templateId}/deactivate`, {
        method: "POST",
        cookie: adminCookie,
      });

      const res = await apiRequest(app, "/api/admin/servers", {
        method: "POST",
        cookie: adminCookie,
        body: { name: "Test Server", nodeId, templateId, variables: {} },
      });
      expect(res.status).toBe(409);
      const body = await parseJson(res);
      expect(body.error.code).toBe("TEMPLATE_INACTIVE");
    });

    it("rejects duplicate name on same node", async () => {
      // First create succeeds (but daemon unreachable → creation_failed, but record exists)
      await apiRequest(app, "/api/admin/servers", {
        method: "POST",
        cookie: adminCookie,
        body: { name: "Dup Server", nodeId, templateId, variables: {} },
      });

      // Second create with same name
      const res = await apiRequest(app, "/api/admin/servers", {
        method: "POST",
        cookie: adminCookie,
        body: { name: "Dup Server", nodeId, templateId, variables: {} },
      });
      expect(res.status).toBe(409);
      const body = await parseJson(res);
      expect(body.error.code).toBe("DUPLICATE_NAME");
    });

    it("rejects when node has no allocations", async () => {
      // Create a second node with no allocations
      const regionId2 = await createRegion("region-2");
      const nodeId2 = await createNode(regionId2, "node-02.test.local");

      const res = await apiRequest(app, "/api/admin/servers", {
        method: "POST",
        cookie: adminCookie,
        body: { name: "No Alloc Server", nodeId: nodeId2, templateId, variables: {} },
      });
      expect(res.status).toBe(409);
      const body = await parseJson(res);
      expect(body.error.code).toBe("NO_AVAILABLE_ALLOCATIONS");
    });

    it("rejects when node not found", async () => {
      const res = await apiRequest(app, "/api/admin/servers", {
        method: "POST",
        cookie: adminCookie,
        body: {
          name: "Ghost Server",
          nodeId: "00000000-0000-4000-8000-000000000000",
          templateId,
          variables: {},
        },
      });
      expect(res.status).toBe(502);
      const body = await parseJson(res);
      expect(body.error.code).toBe("NODE_NOT_FOUND");
    });
  });

  describe("GET /api/admin/servers", () => {
    it("lists servers with total count", async () => {
      const res = await apiRequest(app, "/api/admin/servers", {
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.servers).toBeInstanceOf(Array);
      expect(body.total).toBe(0);
    });

    it("filters by nodeId", async () => {
      const res = await apiRequest(app, `/api/admin/servers?nodeId=${nodeId}`, {
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.servers).toBeInstanceOf(Array);
    });

    it("filters by status", async () => {
      const res = await apiRequest(app, "/api/admin/servers?status=offline", {
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.servers).toBeInstanceOf(Array);
    });
  });

  describe("GET /api/admin/servers/:serverId", () => {
    it("returns 404 for non-existent server", async () => {
      const res = await apiRequest(app, "/api/admin/servers/00000000-0000-4000-8000-000000000000", {
        cookie: adminCookie,
      });
      expect(res.status).toBe(404);
      const body = await parseJson(res);
      expect(body.error.code).toBe("SERVER_NOT_FOUND");
    });
  });

  describe("POST /api/admin/servers/:serverId/power", () => {
    it("returns 404 for non-existent server", async () => {
      const res = await apiRequest(
        app,
        "/api/admin/servers/00000000-0000-4000-8000-000000000000/power",
        {
          method: "POST",
          cookie: adminCookie,
          body: { action: "start" },
        },
      );
      expect(res.status).toBe(502);
      const body = await parseJson(res);
      expect(body.error.code).toBe("SERVER_NOT_FOUND");
    });
  });

  describe("DELETE /api/admin/servers/:serverId", () => {
    it("returns 404 for non-existent server", async () => {
      const res = await apiRequest(app, "/api/admin/servers/00000000-0000-4000-8000-000000000000", {
        method: "DELETE",
        cookie: adminCookie,
      });
      expect(res.status).toBe(404);
      const body = await parseJson(res);
      expect(body.error.code).toBe("SERVER_NOT_FOUND");
    });
  });

  describe("non-admin access", () => {
    it("rejects non-admin user", async () => {
      // Create a regular user
      await apiRequest(app, "/api/admin/users", {
        method: "POST",
        cookie: adminCookie,
        body: {
          email: "user@test.local",
          username: "user",
          password: "user12345",
          role: "user",
        },
      });

      const userLogin = await loginAndGetCookie(app, "user@test.local", "user12345");

      const res = await apiRequest(app, "/api/admin/servers", {
        cookie: userLogin.cookie,
      });
      expect(res.status).toBe(403);
    });
  });
});
