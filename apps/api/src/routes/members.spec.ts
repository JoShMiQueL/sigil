import { db, schema } from "@sigil/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import {
  apiRequest,
  cleanupDatabase,
  createAdmin,
  createNode,
  createNodeCredentials,
  createRegion,
  createUser,
  loginAndGetCookie,
  parseJson,
} from "../test/helpers";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

async function createServerRecord(nodeId: string, name: string): Promise<string> {
  const [row] = await db
    .insert(schema.servers)
    .values({ name, nodeId, status: "offline", config: {} })
    .returning();
  return row.id;
}

async function createTemplateRecord(name: string): Promise<string> {
  const [row] = await db
    .insert(schema.templates)
    .values({
      name,
      image: "test:latest",
      startupCommand: "echo hello",
      environment: {},
      portMappings: [],
      resourceLimits: { memoryMb: 1024, cpuLimit: 1 },
      active: true,
    })
    .returning();
  return row.id;
}

const NO_PERMS = {
  console: false,
  files: false,
  backups: false,
  power: false,
  settings: false,
  members: false,
  allocations: false,
  databases: false,
};

const CONSOLE_FILES_PERMS = {
  console: true,
  files: true,
  backups: false,
  power: false,
  settings: false,
  members: false,
  allocations: false,
  databases: false,
};

const MEMBERS_PERMS = {
  console: false,
  files: false,
  backups: false,
  power: false,
  settings: false,
  members: true,
  allocations: false,
  databases: false,
};

function toCols(p: typeof NO_PERMS) {
  return {
    canConsole: p.console,
    canFiles: p.files,
    canBackups: p.backups,
    canPower: p.power,
    canSettings: p.settings,
    canMembers: p.members,
    canAllocations: p.allocations,
    canDatabases: p.databases,
  };
}

describe("member routes [R13]", () => {
  let adminCookie: string;
  let nodeId: string;
  let serverId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin("admin@test.local");
    const login = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    if (!login.cookie) throw new Error("Admin login did not return a cookie");
    adminCookie = login.cookie;
    const regionId = await createRegion();
    nodeId = await createNode(regionId, "member-node.test.local");
    await createNodeCredentials(nodeId);
    await createTemplateRecord("member-template");
    serverId = await createServerRecord(nodeId, "member-test-server");
  });

  describe("GET /api/admin/servers/:serverId/members", () => {
    it("returns 401 for unauthenticated requests", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "GET",
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-member non-admin", async () => {
      await createUser("nonmember@test.local");
      const userCookie = (await loginAndGetCookie(app, "nonmember@test.local", "userpass123"))
        .cookie;
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "GET",
        cookie: userCookie,
      });
      expect(res.status).toBe(403);
    });

    it("returns empty list for non-existent server (admin)", async () => {
      const res = await apiRequest(
        app,
        "/api/admin/servers/00000000-0000-4000-8000-000000000000/members",
        {
          method: "GET",
          cookie: adminCookie,
        },
      );
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.members).toEqual([]);
    });
  });

  describe("POST /api/admin/servers/:serverId/members", () => {
    it("adds a member with permissions", async () => {
      await createUser("subuser@test.local");
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "POST",
        cookie: adminCookie,
        body: { email: "subuser@test.local", permissions: CONSOLE_FILES_PERMS },
      });
      expect(res.status).toBe(201);
      const body = await parseJson(res);
      expect(body.email).toBe("subuser@test.local");
      expect(body.role).toBe("member");
      expect(body.permissions.console).toBe(true);
      expect(body.permissions.files).toBe(true);
      expect(body.permissions.backups).toBe(false);
    });

    it("returns 400 for non-existent user email", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "POST",
        cookie: adminCookie,
        body: { email: "nobody@test.local", permissions: NO_PERMS },
      });
      expect(res.status).toBe(400);
      const body = await parseJson(res);
      expect(body.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns 400 for duplicate member", async () => {
      await createUser("dup@test.local");
      await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "POST",
        cookie: adminCookie,
        body: { email: "dup@test.local", permissions: NO_PERMS },
      });
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "POST",
        cookie: adminCookie,
        body: { email: "dup@test.local", permissions: NO_PERMS },
      });
      expect(res.status).toBe(400);
      const body = await parseJson(res);
      expect(body.error.code).toBe("DUPLICATE_MEMBER");
    });

    it("returns 401 for unauthenticated requests", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "POST",
        body: { email: "subuser@test.local", permissions: NO_PERMS },
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 for member without members permission", async () => {
      const userId = await createUser("subuser2@test.local");
      const subCookie = (await loginAndGetCookie(app, "subuser2@test.local", "userpass123")).cookie;
      // Add as member without members permission
      await db.insert(schema.serverMembers).values({
        serverId,
        userId,
        role: "member",
        ...toCols(CONSOLE_FILES_PERMS),
      });
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "POST",
        cookie: subCookie,
        body: { email: "subuser@test.local", permissions: NO_PERMS },
      });
      expect(res.status).toBe(403);
    });

    it("allows member with members permission to add", async () => {
      const userId = await createUser("subuser3@test.local");
      const subCookie = (await loginAndGetCookie(app, "subuser3@test.local", "userpass123")).cookie;
      await createUser("subuser4@test.local");
      // Add as member with members permission
      await db.insert(schema.serverMembers).values({
        serverId,
        userId,
        role: "member",
        ...toCols(MEMBERS_PERMS),
      });
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "POST",
        cookie: subCookie,
        body: { email: "subuser4@test.local", permissions: NO_PERMS },
      });
      expect(res.status).toBe(201);
    });
  });

  describe("permission enforcement", () => {
    it("subuser sees only their servers", async () => {
      await createUser("subuser5@test.local");
      const subCookie = (await loginAndGetCookie(app, "subuser5@test.local", "userpass123")).cookie;

      // Before being added, sees no servers
      const res1 = await apiRequest(app, "/api/admin/servers", {
        cookie: subCookie,
      });
      expect(res1.status).toBe(200);
      const body1 = await parseJson(res1);
      expect(body1.servers).toEqual([]);

      // Add as member
      await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "POST",
        cookie: adminCookie,
        body: { email: "subuser5@test.local", permissions: CONSOLE_FILES_PERMS },
      });

      // After being added, sees the server
      const res2 = await apiRequest(app, "/api/admin/servers", {
        cookie: subCookie,
      });
      expect(res2.status).toBe(200);
      const body2 = await parseJson(res2);
      expect(body2.servers.length).toBe(1);
      expect(body2.servers[0].id).toBe(serverId);
    });

    it("admin bypasses all permission checks", async () => {
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members`, {
        method: "GET",
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);
    });
  });

  describe("route-level permission enforcement", () => {
    it("subuser without files permission gets 403 on files route", async () => {
      const userId = await createUser("nofiles@test.local");
      const subCookie = (await loginAndGetCookie(app, "nofiles@test.local", "userpass123")).cookie;
      await db.insert(schema.serverMembers).values({
        serverId,
        userId,
        role: "member",
        ...toCols(NO_PERMS),
      });
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/files`, {
        cookie: subCookie,
      });
      expect(res.status).toBe(403);
    });

    it("subuser without backups permission gets 403 on backups route", async () => {
      const userId = await createUser("nobackups@test.local");
      const subCookie = (await loginAndGetCookie(app, "nobackups@test.local", "userpass123"))
        .cookie;
      await db.insert(schema.serverMembers).values({
        serverId,
        userId,
        role: "member",
        ...toCols(NO_PERMS),
      });
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/backups`, {
        cookie: subCookie,
      });
      expect(res.status).toBe(403);
    });

    it("non-member gets 403 on files route", async () => {
      await createUser("nonmember2@test.local");
      const subCookie = (await loginAndGetCookie(app, "nonmember2@test.local", "userpass123"))
        .cookie;
      const res = await apiRequest(app, `/api/admin/servers/${serverId}/files`, {
        cookie: subCookie,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("PUT /api/admin/servers/:serverId/members/:memberId", () => {
    it("updates member permissions", async () => {
      const userId = await createUser("updateuser@test.local");
      const [member] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId,
          role: "member",
          ...toCols(NO_PERMS),
        })
        .returning();

      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members/${member.id}`, {
        method: "PUT",
        cookie: adminCookie,
        body: { permissions: CONSOLE_FILES_PERMS },
      });
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.permissions.console).toBe(true);
      expect(body.permissions.files).toBe(true);
      expect(body.permissions.backups).toBe(false);
    });

    it("returns 403 when updating owner", async () => {
      const userId = await createUser("owner2@test.local");
      const [member] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId,
          role: "owner",
          ...toCols({ ...NO_PERMS, console: true }),
        })
        .returning();

      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members/${member.id}`, {
        method: "PUT",
        cookie: adminCookie,
        body: { permissions: NO_PERMS },
      });
      expect(res.status).toBe(403);
      const body = await parseJson(res);
      expect(body.error.code).toBe("CANNOT_MODIFY_OWNER");
    });

    it("returns 404 for non-existent member", async () => {
      const res = await apiRequest(
        app,
        `/api/admin/servers/${serverId}/members/00000000-0000-4000-8000-000000000000`,
        {
          method: "PUT",
          cookie: adminCookie,
          body: { permissions: NO_PERMS },
        },
      );
      expect(res.status).toBe(404);
      const body = await parseJson(res);
      expect(body.error.code).toBe("MEMBER_NOT_FOUND");
    });
  });

  describe("DELETE /api/admin/servers/:serverId/members/:memberId", () => {
    it("removes a member", async () => {
      const userId = await createUser("removeuser@test.local");
      const [member] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId,
          role: "member",
          ...toCols(NO_PERMS),
        })
        .returning();

      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members/${member.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      expect(res.status).toBe(200);

      // Verify member is removed
      const [check] = await db
        .select()
        .from(schema.serverMembers)
        .where(eq(schema.serverMembers.id, member.id))
        .limit(1);
      expect(check).toBeUndefined();
    });

    it("returns 403 when removing owner", async () => {
      const userId = await createUser("owner3@test.local");
      const [member] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId,
          role: "owner",
          ...toCols({ ...NO_PERMS, console: true }),
        })
        .returning();

      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members/${member.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      expect(res.status).toBe(403);
      const body = await parseJson(res);
      expect(body.error.code).toBe("CANNOT_REMOVE_OWNER");
    });

    it("returns 404 for non-existent member", async () => {
      const res = await apiRequest(
        app,
        `/api/admin/servers/${serverId}/members/00000000-0000-4000-8000-000000000000`,
        {
          method: "DELETE",
          cookie: adminCookie,
        },
      );
      expect(res.status).toBe(404);
      const body = await parseJson(res);
      expect(body.error.code).toBe("MEMBER_NOT_FOUND");
    });

    it("removed member loses server access", async () => {
      const userId = await createUser("removed@test.local");
      const subCookie = (await loginAndGetCookie(app, "removed@test.local", "userpass123")).cookie;
      const [member] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId,
          role: "member",
          ...toCols(CONSOLE_FILES_PERMS),
        })
        .returning();

      // Before removal, can see server
      const res1 = await apiRequest(app, "/api/admin/servers", {
        cookie: subCookie,
      });
      expect(res1.status).toBe(200);
      const body1 = await parseJson(res1);
      expect(body1.servers.length).toBe(1);

      // Remove member
      await apiRequest(app, `/api/admin/servers/${serverId}/members/${member.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      // After removal, sees no servers
      const res2 = await apiRequest(app, "/api/admin/servers", {
        cookie: subCookie,
      });
      expect(res2.status).toBe(200);
      const body2 = await parseJson(res2);
      expect(body2.servers).toEqual([]);
    });
  });

  describe("POST /api/admin/servers/:serverId/members/transfer", () => {
    it("transfers ownership successfully", async () => {
      const ownerUserId = await createUser("origowner@test.local");
      const newOwnerUserId = await createUser("newowner@test.local");

      // Create original owner
      const [origOwner] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId: ownerUserId,
          role: "owner",
          ...toCols({ ...NO_PERMS, console: true }),
        })
        .returning();

      // Create new owner as member
      const [newOwner] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId: newOwnerUserId,
          role: "member",
          ...toCols(NO_PERMS),
        })
        .returning();

      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members/transfer`, {
        method: "POST",
        cookie: adminCookie,
        body: { newOwnerId: newOwner.id },
      });
      expect(res.status).toBe(200);

      // Verify old owner is now member
      const [oldOwnerRow] = await db
        .select()
        .from(schema.serverMembers)
        .where(eq(schema.serverMembers.id, origOwner.id))
        .limit(1);
      expect(oldOwnerRow?.role).toBe("member");

      // Verify new owner is now owner
      const [newOwnerRow] = await db
        .select()
        .from(schema.serverMembers)
        .where(eq(schema.serverMembers.id, newOwner.id))
        .limit(1);
      expect(newOwnerRow?.role).toBe("owner");
      expect(newOwnerRow?.canConsole).toBe(true);
      expect(newOwnerRow?.canFiles).toBe(true);
      expect(newOwnerRow?.canBackups).toBe(true);
    });

    it("returns 404 for non-existent target member", async () => {
      // Create an owner first
      const ownerUserId = await createUser("owner5@test.local");
      await db.insert(schema.serverMembers).values({
        serverId,
        userId: ownerUserId,
        role: "owner",
        ...toCols({ ...NO_PERMS, console: true }),
      });

      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members/transfer`, {
        method: "POST",
        cookie: adminCookie,
        body: { newOwnerId: "00000000-0000-4000-8000-000000000000" },
      });
      expect(res.status).toBe(404);
      const body = await parseJson(res);
      expect(body.error.code).toBe("MEMBER_NOT_FOUND");
    });

    it("returns 403 for non-owner non-admin transfer", async () => {
      const userId = await createUser("nonowner@test.local");
      const subCookie = (await loginAndGetCookie(app, "nonowner@test.local", "userpass123")).cookie;
      const [member] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId,
          role: "member",
          ...toCols(MEMBERS_PERMS),
        })
        .returning();

      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members/transfer`, {
        method: "POST",
        cookie: subCookie,
        body: { newOwnerId: member.id },
      });
      expect(res.status).toBe(403);
    });

    it("owner can transfer ownership", async () => {
      const ownerUserId = await createUser("owner4@test.local");
      const newOwnerUserId = await createUser("newowner4@test.local");
      const ownerCookie = (await loginAndGetCookie(app, "owner4@test.local", "userpass123")).cookie;

      // Create owner
      await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId: ownerUserId,
          role: "owner",
          ...toCols({ ...NO_PERMS, console: true }),
        })
        .returning();

      // Create new owner as member
      const [newOwner] = await db
        .insert(schema.serverMembers)
        .values({
          serverId,
          userId: newOwnerUserId,
          role: "member",
          ...toCols(NO_PERMS),
        })
        .returning();

      const res = await apiRequest(app, `/api/admin/servers/${serverId}/members/transfer`, {
        method: "POST",
        cookie: ownerCookie,
        body: { newOwnerId: newOwner.id },
      });
      expect(res.status).toBe(200);
    });
  });
});
