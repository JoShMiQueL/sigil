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
  createUser,
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

describe("backup routes [R12]", () => {
  let adminCookie: string | null;
  let nodeId: string;
  let templateId: string;
  let serverId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    await createAdmin();
    const result = await loginAndGetCookie(app, "admin@test.local", "admin12345");
    adminCookie = result.cookie;
    const regionId = await createRegion("test-region");
    nodeId = await createNode(regionId, "backup-node");
    await createNodeCredentials(nodeId);
    templateId = await createTemplate(adminCookie, "backup-template");
    await activateTemplate(adminCookie, templateId);
    serverId = await createServerRecord(nodeId, templateId, "backup-test-server");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("lists backups for a server (empty)", async () => {
    const res = await apiRequest(app, `/api/admin/servers/${serverId}/backups`, {
      method: "GET",
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.backups).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns 404 for non-existent server", async () => {
    const res = await apiRequest(
      app,
      "/api/admin/servers/00000000-0000-0000-0000-000000000000/backups",
      {
        method: "GET",
        cookie: adminCookie,
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin user", async () => {
    await createUser("user@test.local", "user12345");
    const result = await loginAndGetCookie(app, "user@test.local", "user12345");
    const res = await apiRequest(app, `/api/admin/servers/${serverId}/backups`, {
      method: "GET",
      cookie: result.cookie,
    });
    expect(res.status).toBe(403);
  });

  it("rejects invalid backup name", async () => {
    const res = await apiRequest(app, `/api/admin/servers/${serverId}/backups`, {
      method: "POST",
      cookie: adminCookie,
      body: { name: "invalid/name" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when creating backup for non-existent server", async () => {
    const res = await apiRequest(
      app,
      "/api/admin/servers/00000000-0000-0000-0000-000000000000/backups",
      {
        method: "POST",
        cookie: adminCookie,
        body: { name: "test-backup" },
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when restoring non-existent backup", async () => {
    const res = await apiRequest(
      app,
      `/api/admin/servers/${serverId}/backups/00000000-0000-0000-0000-000000000000/restore`,
      {
        method: "POST",
        cookie: adminCookie,
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting non-existent backup", async () => {
    const res = await apiRequest(
      app,
      `/api/admin/servers/${serverId}/backups/00000000-0000-0000-0000-000000000000`,
      {
        method: "DELETE",
        cookie: adminCookie,
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when restoring a non-completed backup", async () => {
    // Create a backup record with status "in_progress"
    const [backup] = await db
      .insert(schema.backups)
      .values({
        serverId,
        nodeId,
        name: "test-backup",
        status: "in_progress",
        storageLocation: "local",
      })
      .returning();

    const res = await apiRequest(
      app,
      `/api/admin/servers/${serverId}/backups/${backup.id}/restore`,
      {
        method: "POST",
        cookie: adminCookie,
      },
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 when restoring backup for non-existent server", async () => {
    const res = await apiRequest(
      app,
      "/api/admin/servers/00000000-0000-0000-0000-000000000000/backups/00000000-0000-0000-0000-000000000000/restore",
      {
        method: "POST",
        cookie: adminCookie,
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when deleting an in-progress backup", async () => {
    const [backup] = await db
      .insert(schema.backups)
      .values({
        serverId,
        nodeId,
        name: "in-progress-backup",
        status: "in_progress",
        storageLocation: "local",
      })
      .returning();

    const res = await apiRequest(app, `/api/admin/servers/${serverId}/backups/${backup.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(409);
  });

  it("lists backups ordered by createdAt desc", async () => {
    // Create two backup records
    await db.insert(schema.backups).values({
      serverId,
      nodeId,
      name: "older-backup",
      status: "completed",
      storageLocation: "local",
      sizeBytes: 100,
    });
    await db.insert(schema.backups).values({
      serverId,
      nodeId,
      name: "newer-backup",
      status: "completed",
      storageLocation: "local",
      sizeBytes: 200,
    });

    const res = await apiRequest(app, `/api/admin/servers/${serverId}/backups`, {
      method: "GET",
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.total).toBe(2);
    expect(body.backups[0].name).toBe("newer-backup");
    expect(body.backups[1].name).toBe("older-backup");
  });
});
