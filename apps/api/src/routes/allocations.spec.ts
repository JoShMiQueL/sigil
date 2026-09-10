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

describe("allocations routes [R7]", () => {
  let adminCookie: string | null;
  let nodeId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local", "admin12345");
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
    const regionId = await createRegion("test-region");
    nodeId = await createNode(regionId, "node-01.test.local");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("POST /:nodeId/allocations", () => {
    it("creates a port range", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565, portEnd: 25575, protocol: "tcp" },
      });

      expect(res.status).toBe(201);
      const body = await parseJson(res);
      expect(body.created).toBe(11);
      expect(body.skipped).toBe(0);
      expect(body.portRange).toBe("25565-25575");
    });

    it("creates a single port", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565 },
      });

      expect(res.status).toBe(201);
      const body = await parseJson(res);
      expect(body.created).toBe(1);
      expect(body.portRange).toBe("25565");
    });

    it("is idempotent for overlapping ranges", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565, portEnd: 25575 },
      });

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25570, portEnd: 25580 },
      });

      expect(res.status).toBe(201);
      const body = await parseJson(res);
      expect(body.created).toBe(5);
      expect(body.skipped).toBe(6);
    });

    it("rejects invalid IP", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "not-an-ip", portStart: 25565 },
      });

      expect(res.status).toBe(400);
    });

    it("rejects port out of range", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 70000 },
      });

      expect(res.status).toBe(400);
    });

    it("rejects portEnd < portStart", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25570, portEnd: 25565 },
      });

      expect(res.status).toBe(400);
    });

    it("rejects non-admin", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        body: { ip: "203.0.113.10", portStart: 25565 },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /:nodeId/allocations", () => {
    beforeEach(async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565, portEnd: 25570 },
      });
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.11", portStart: 25565, portEnd: 25567 },
      });
    });

    it("lists all allocations with summary", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.allocations).toHaveLength(9);
      expect(body.total).toBe(9);
      expect(body.available).toBe(9);
      expect(body.assigned).toBe(0);
    });

    it("filters by status", async () => {
      // Assign one
      const listRes = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });
      const list = await parseJson(listRes);
      const firstId = list.allocations[0].id;
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${firstId}/assign`, {
        method: "POST",
        cookie: adminCookie,
        body: { serverId: "00000000-0000-4000-8000-000000000001", isPrimary: true },
      });

      const availableRes = await apiRequest(
        app,
        `/api/admin/nodes/${nodeId}/allocations?status=available`,
        { cookie: adminCookie },
      );
      const assignedRes = await apiRequest(
        app,
        `/api/admin/nodes/${nodeId}/allocations?status=assigned`,
        { cookie: adminCookie },
      );

      const available = await parseJson(availableRes);
      const assigned = await parseJson(assignedRes);
      expect(available.allocations).toHaveLength(8);
      expect(assigned.allocations).toHaveLength(1);
    });

    it("filters by IP", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations?ip=203.0.113.11`, {
        cookie: adminCookie,
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.allocations).toHaveLength(3);
    });

    it("searches by port", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations?port=25565`, {
        cookie: adminCookie,
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.allocations).toHaveLength(2);
    });

    it("paginates", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations?limit=5&offset=0`, {
        cookie: adminCookie,
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.allocations).toHaveLength(5);
    });
  });

  describe("GET /:nodeId/allocations/summary", () => {
    it("returns summary with primary IP", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565, portEnd: 25570 },
      });

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/summary`, {
        cookie: adminCookie,
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.total).toBe(6);
      expect(body.available).toBe(6);
      expect(body.assigned).toBe(0);
      expect(body.primaryIp).toBeNull();
    });
  });

  describe("DELETE /:nodeId/allocations/:allocationId", () => {
    it("deletes an available allocation", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565 },
      });
      const listRes = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });
      const list = await parseJson(listRes);
      const id = list.allocations[0].id;

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      expect(res.status).toBe(204);
    });

    it("rejects deletion of assigned allocation (409)", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565 },
      });
      const listRes = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });
      const list = await parseJson(listRes);
      const id = list.allocations[0].id;
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}/assign`, {
        method: "POST",
        cookie: adminCookie,
        body: { serverId: "00000000-0000-4000-8000-000000000001", isPrimary: false },
      });

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      expect(res.status).toBe(409);
      const body = await parseJson(res);
      expect(body.error.code).toBe("ALLOCATION_ASSIGNED");
    });
  });

  describe("POST /:nodeId/allocations/:allocationId/assign", () => {
    it("assigns an available allocation", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565 },
      });
      const listRes = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });
      const list = await parseJson(listRes);
      const id = list.allocations[0].id;

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}/assign`, {
        method: "POST",
        cookie: adminCookie,
        body: { serverId: "00000000-0000-4000-8000-000000000001", isPrimary: true },
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.status).toBe("assigned");
      expect(body.isPrimary).toBe(true);
    });

    it("rejects assigning already-assigned to different server (409)", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565 },
      });
      const listRes = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });
      const list = await parseJson(listRes);
      const id = list.allocations[0].id;
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}/assign`, {
        method: "POST",
        cookie: adminCookie,
        body: { serverId: "00000000-0000-4000-8000-000000000001", isPrimary: false },
      });

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}/assign`, {
        method: "POST",
        cookie: adminCookie,
        body: { serverId: "00000000-0000-4000-8000-000000000002", isPrimary: false },
      });

      expect(res.status).toBe(409);
      const body = await parseJson(res);
      expect(body.error.code).toBe("ALLOCATION_ALREADY_ASSIGNED");
    });
  });

  describe("POST /:nodeId/allocations/:allocationId/unassign", () => {
    it("unassigns an assigned allocation", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565 },
      });
      const listRes = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });
      const list = await parseJson(listRes);
      const id = list.allocations[0].id;
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}/assign`, {
        method: "POST",
        cookie: adminCookie,
        body: { serverId: "00000000-0000-4000-8000-000000000001", isPrimary: true },
      });

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}/unassign`, {
        method: "POST",
        cookie: adminCookie,
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.status).toBe("available");
      expect(body.serverId).toBeNull();
      expect(body.isPrimary).toBe(false);
    });

    it("rejects unassigning an available allocation (409)", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565 },
      });
      const listRes = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });
      const list = await parseJson(listRes);
      const id = list.allocations[0].id;

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/${id}/unassign`, {
        method: "POST",
        cookie: adminCookie,
      });

      expect(res.status).toBe(409);
    });
  });

  describe("POST /:nodeId/allocations/auto-assign", () => {
    it("auto-assigns an available allocation", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565, portEnd: 25567 },
      });

      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/auto-assign`, {
        method: "POST",
        cookie: adminCookie,
        body: { serverId: "00000000-0000-4000-8000-000000000001" },
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.allocation.status).toBe("assigned");
      expect(body.allocation.isPrimary).toBe(true);
      expect(body.allocation.port).toBe(25565);
    });

    it("returns 409 when no available allocations", async () => {
      const res = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations/auto-assign`, {
        method: "POST",
        cookie: adminCookie,
        body: { serverId: "00000000-0000-4000-8000-000000000001" },
      });

      expect(res.status).toBe(409);
      const body = await parseJson(res);
      expect(body.error.code).toBe("NO_AVAILABLE_ALLOCATIONS");
    });
  });

  describe("POST /allocations/release", () => {
    it("releases all allocations for a server", async () => {
      await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        method: "POST",
        cookie: adminCookie,
        body: { ip: "203.0.113.10", portStart: 25565, portEnd: 25570 },
      });
      const listRes = await apiRequest(app, `/api/admin/nodes/${nodeId}/allocations`, {
        cookie: adminCookie,
      });
      const list = await parseJson(listRes);
      const serverId = "00000000-0000-4000-8000-000000000001";
      await apiRequest(
        app,
        `/api/admin/nodes/${nodeId}/allocations/${list.allocations[0].id}/assign`,
        {
          method: "POST",
          cookie: adminCookie,
          body: { serverId, isPrimary: true },
        },
      );
      await apiRequest(
        app,
        `/api/admin/nodes/${nodeId}/allocations/${list.allocations[1].id}/assign`,
        {
          method: "POST",
          cookie: adminCookie,
          body: { serverId, isPrimary: false },
        },
      );

      const res = await apiRequest(app, "/api/admin/nodes/allocations/release", {
        method: "POST",
        cookie: adminCookie,
        body: { serverId },
      });

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.released).toBe(2);
    });
  });
});
