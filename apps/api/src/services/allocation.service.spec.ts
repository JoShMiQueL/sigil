import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import { cleanupDatabase, createAdmin, createNode, createRegion } from "../test/helpers";
import {
  addAllocations,
  assignAllocation,
  autoAssignAllocation,
  deleteAllocation,
  getAllocationSummary,
  listAllocations,
  releaseAllocations,
  unassignAllocation,
} from "./allocation.service";

describe("allocation.service [R7]", () => {
  let nodeId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin();
    const regionId = await createRegion("test-region");
    nodeId = await createNode(regionId, "node-01.test.local");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("addAllocations", () => {
    it("creates a single port allocation", async () => {
      const result = await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.ip).toBe("203.0.113.10");
      expect(result.portRange).toBe("25565");
    });

    it("creates a range of ports", async () => {
      const result = await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        portEnd: 25575,
        protocol: "tcp",
      });

      expect(result.created).toBe(11);
      expect(result.skipped).toBe(0);
      expect(result.portRange).toBe("25565-25575");
    });

    it("skips overlapping ports (idempotent)", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        portEnd: 25575,
        protocol: "tcp",
      });

      const result = await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25570,
        portEnd: 25580,
        protocol: "tcp",
      });

      expect(result.created).toBe(5); // 25576-25580
      expect(result.skipped).toBe(6); // 25570-25575
    });

    it("supports udp protocol", async () => {
      const result = await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "udp",
      });

      expect(result.created).toBe(1);
    });

    it("allows same port with different protocols", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });

      const result = await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "udp",
      });

      expect(result.created).toBe(1);
    });

    it("allows same port with different IPs", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });

      const result = await addAllocations(nodeId, {
        ip: "203.0.113.11",
        portStart: 25565,
        protocol: "tcp",
      });

      expect(result.created).toBe(1);
    });
  });

  describe("listAllocations", () => {
    beforeEach(async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        portEnd: 25570,
        protocol: "tcp",
      });
      await addAllocations(nodeId, {
        ip: "203.0.113.11",
        portStart: 25565,
        portEnd: 25567,
        protocol: "tcp",
      });
    });

    it("lists all allocations with summary", async () => {
      const result = await listAllocations(nodeId, {});

      expect(result.allocations).toHaveLength(9);
      expect(result.total).toBe(9);
      expect(result.available).toBe(9);
      expect(result.assigned).toBe(0);
    });

    it("filters by status", async () => {
      // Assign one allocation
      const list = await listAllocations(nodeId, {});
      const firstId = list.allocations[0].id;
      await assignAllocation(firstId, "00000000-0000-4000-8000-000000000001", false);

      const available = await listAllocations(nodeId, { status: "available" });
      const assigned = await listAllocations(nodeId, { status: "assigned" });

      expect(available.allocations).toHaveLength(8);
      expect(assigned.allocations).toHaveLength(1);
    });

    it("filters by IP", async () => {
      const result = await listAllocations(nodeId, { ip: "203.0.113.11" });
      expect(result.allocations).toHaveLength(3);
      expect(result.allocations.every((a) => a.ip === "203.0.113.11")).toBe(true);
    });

    it("searches by port", async () => {
      const result = await listAllocations(nodeId, { port: 25565 });
      expect(result.allocations).toHaveLength(2); // one per IP
      expect(result.allocations.every((a) => a.port === 25565)).toBe(true);
    });

    it("paginates with limit and offset", async () => {
      const page1 = await listAllocations(nodeId, { limit: 5, offset: 0 });
      const page2 = await listAllocations(nodeId, { limit: 5, offset: 5 });

      expect(page1.allocations).toHaveLength(5);
      expect(page2.allocations).toHaveLength(4);
    });
  });

  describe("getAllocationSummary", () => {
    it("returns counts and primary IP", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        portEnd: 25570,
        protocol: "tcp",
      });

      const summary = await getAllocationSummary(nodeId);
      expect(summary.total).toBe(6);
      expect(summary.available).toBe(6);
      expect(summary.assigned).toBe(0);
      expect(summary.primaryIp).toBeNull();
    });
  });

  describe("deleteAllocation", () => {
    it("deletes an available allocation", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });
      const list = await listAllocations(nodeId, {});
      const id = list.allocations[0].id;

      const result = await deleteAllocation(id);
      expect(result).toEqual({ ok: true });

      const after = await listAllocations(nodeId, {});
      expect(after.total).toBe(0);
    });

    it("rejects deletion of assigned allocation", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });
      const list = await listAllocations(nodeId, {});
      const id = list.allocations[0].id;
      await assignAllocation(id, "00000000-0000-4000-8000-000000000001", false);

      const result = await deleteAllocation(id);
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("ALLOCATION_ASSIGNED");
      }
    });

    it("returns error for non-existent allocation", async () => {
      const result = await deleteAllocation("00000000-0000-4000-8000-000000000099");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("ALLOCATION_NOT_FOUND");
      }
    });
  });

  describe("assignAllocation", () => {
    it("assigns an available allocation to a server", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });
      const list = await listAllocations(nodeId, {});
      const id = list.allocations[0].id;

      const result = await assignAllocation(id, "00000000-0000-4000-8000-000000000001", true);

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.status).toBe("assigned");
        expect(result.serverId).toBe("00000000-0000-4000-8000-000000000001");
        expect(result.isPrimary).toBe(true);
      }
    });

    it("rejects assigning an already-assigned allocation to a different server", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });
      const list = await listAllocations(nodeId, {});
      const id = list.allocations[0].id;
      await assignAllocation(id, "00000000-0000-4000-8000-000000000001", false);

      const result = await assignAllocation(id, "00000000-0000-4000-8000-000000000002", false);
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("ALLOCATION_ALREADY_ASSIGNED");
      }
    });

    it("allows re-assigning to the same server (idempotent)", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });
      const list = await listAllocations(nodeId, {});
      const id = list.allocations[0].id;
      await assignAllocation(id, "00000000-0000-4000-8000-000000000001", false);

      const result = await assignAllocation(id, "00000000-0000-4000-8000-000000000001", true);
      expect("error" in result).toBe(false);
    });
  });

  describe("unassignAllocation", () => {
    it("unassigns an assigned allocation", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });
      const list = await listAllocations(nodeId, {});
      const id = list.allocations[0].id;
      await assignAllocation(id, "00000000-0000-4000-8000-000000000001", true);

      const result = await unassignAllocation(id);

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.status).toBe("available");
        expect(result.serverId).toBeNull();
        expect(result.isPrimary).toBe(false);
      }
    });

    it("rejects unassigning an available allocation", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        protocol: "tcp",
      });
      const list = await listAllocations(nodeId, {});
      const id = list.allocations[0].id;

      const result = await unassignAllocation(id);
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("ALLOCATION_NOT_ASSIGNED");
      }
    });
  });

  describe("autoAssignAllocation", () => {
    it("auto-assigns from any available when no primary IP", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        portEnd: 25567,
        protocol: "tcp",
      });

      const result = await autoAssignAllocation(nodeId, "00000000-0000-4000-8000-000000000001");

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.status).toBe("assigned");
        expect(result.isPrimary).toBe(true);
        expect(result.port).toBe(25565); // lowest port
      }
    });

    it("returns error when no available allocations", async () => {
      const result = await autoAssignAllocation(nodeId, "00000000-0000-4000-8000-000000000001");

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("NO_AVAILABLE_ALLOCATIONS");
      }
    });
  });

  describe("releaseAllocations", () => {
    it("releases all allocations for a server", async () => {
      await addAllocations(nodeId, {
        ip: "203.0.113.10",
        portStart: 25565,
        portEnd: 25570,
        protocol: "tcp",
      });
      const list = await listAllocations(nodeId, {});
      const serverId = "00000000-0000-4000-8000-000000000001";
      await assignAllocation(list.allocations[0].id, serverId, true);
      await assignAllocation(list.allocations[1].id, serverId, false);

      const result = await releaseAllocations(serverId);
      expect(result.released).toBe(2);

      const after = await listAllocations(nodeId, { status: "available" });
      expect(after.allocations).toHaveLength(6);
    });

    it("returns 0 when server has no allocations", async () => {
      const result = await releaseAllocations("00000000-0000-4000-8000-000000000099");
      expect(result.released).toBe(0);
    });
  });
});
