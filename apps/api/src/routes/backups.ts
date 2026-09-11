import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@sigil/db";
import { CreateBackupInputSchema } from "@sigil/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import { createDaemonClient, DaemonError } from "../services/daemon-client.service";

const backups = new Hono<AuthContext>();

// Admin-only guard
backups.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: { code: "FORBIDDEN", message: "Forbidden" } }, 403);
  }
  await next();
});

// Helper: look up server and verify it exists
async function getServerForBackupOp(serverId: string) {
  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  return server;
}

// Helper: get backup storage config for a node
async function getStorageConfig(nodeId: string) {
  const [config] = await db
    .select()
    .from(schema.backupStorageConfigs)
    .where(eq(schema.backupStorageConfigs.nodeId, nodeId))
    .limit(1);
  return config;
}

function daemonErrorResponse(err: unknown): Response {
  if (err instanceof DaemonError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: err.statusCode },
    );
  }
  return Response.json(
    { error: { code: "DAEMON_UNREACHABLE", message: (err as Error).message } },
    { status: 502 },
  );
}

// List backups for a server
backups.get("/", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const server = await getServerForBackupOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  const rows = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.serverId, serverId))
    .orderBy(desc(schema.backups.createdAt));

  const result = rows.map((r) => ({
    id: r.id,
    serverId: r.serverId,
    nodeId: r.nodeId,
    name: r.name,
    sizeBytes: r.sizeBytes,
    status: r.status,
    storageLocation: r.storageLocation,
    checksum: r.checksum,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));

  return c.json({ backups: result, total: result.length });
});

// Create a backup
backups.post("/", zValidator("json", CreateBackupInputSchema), async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const input = c.req.valid("json");

  const server = await getServerForBackupOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  // Check if a backup is already in progress
  const [existing] = await db
    .select()
    .from(schema.backups)
    .where(and(eq(schema.backups.serverId, serverId), eq(schema.backups.status, "in_progress")))
    .limit(1);
  if (existing)
    return c.json(
      {
        error: {
          code: "BACKUP_IN_PROGRESS",
          message: "A backup is already in progress for this server",
        },
      },
      409,
    );

  // Get storage config
  const storageConfig = await getStorageConfig(server.nodeId);
  const storageLocation = storageConfig?.backend ?? "local";

  // Create backup record
  const backupId = crypto.randomUUID();
  await db.insert(schema.backups).values({
    id: backupId,
    serverId,
    nodeId: server.nodeId,
    name: input.name,
    status: "in_progress",
    storageLocation,
  });

  // Send command to daemon
  try {
    const client = await createDaemonClient(server.nodeId);
    const s3Config =
      storageLocation === "s3" && storageConfig
        ? {
            endpoint: storageConfig.s3Endpoint ?? "",
            bucket: storageConfig.s3Bucket ?? "",
            accessKey: storageConfig.s3AccessKey ?? "",
            secretKey: storageConfig.s3SecretKey ?? "",
            region: storageConfig.s3Region ?? "",
          }
        : undefined;

    const result = await client.createBackup(
      serverId,
      backupId,
      input.name,
      storageLocation,
      s3Config,
    );

    // Update backup record with results
    const [updated] = await db
      .update(schema.backups)
      .set({
        sizeBytes: result.sizeBytes,
        checksum: result.checksum,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(schema.backups.id, backupId))
      .returning();

    await logAudit({
      action: "backup_create",
      userId: c.get("user")?.id ?? "",
      targetId: backupId,
      metadata: { serverId, name: input.name, sizeBytes: result.sizeBytes },
    });

    return c.json(
      {
        id: updated.id,
        serverId: updated.serverId,
        nodeId: updated.nodeId,
        name: updated.name,
        sizeBytes: updated.sizeBytes,
        status: updated.status,
        storageLocation: updated.storageLocation,
        checksum: updated.checksum,
        errorMessage: updated.errorMessage,
        createdAt: updated.createdAt.toISOString(),
        completedAt: updated.completedAt?.toISOString() ?? null,
      },
      201,
    );
  } catch (err) {
    // Mark backup as failed
    await db
      .update(schema.backups)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        completedAt: new Date(),
      })
      .where(eq(schema.backups.id, backupId));

    return daemonErrorResponse(err);
  }
});

// Restore a backup
backups.post("/:backupId/restore", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const backupId = c.req.param("backupId") ?? "";

  const server = await getServerForBackupOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  const [backup] = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.id, backupId))
    .limit(1);
  if (!backup)
    return c.json({ error: { code: "BACKUP_NOT_FOUND", message: "Backup not found" } }, 404);

  if (backup.status !== "completed")
    return c.json(
      {
        error: {
          code: "BACKUP_NOT_COMPLETED",
          message: "Backup must be completed before restoring",
        },
      },
      409,
    );

  // Stop the server if running
  if (server.status === "running" || server.status === "starting") {
    try {
      const client = await createDaemonClient(server.nodeId);
      await client.stopServer(serverId);
    } catch (err) {
      return daemonErrorResponse(err);
    }
  }

  // Restore via daemon
  try {
    const client = await createDaemonClient(server.nodeId);
    const storageConfig = await getStorageConfig(server.nodeId);
    const s3Config =
      backup.storageLocation === "s3" && storageConfig
        ? {
            endpoint: storageConfig.s3Endpoint ?? "",
            bucket: storageConfig.s3Bucket ?? "",
            accessKey: storageConfig.s3AccessKey ?? "",
            secretKey: storageConfig.s3SecretKey ?? "",
            region: storageConfig.s3Region ?? "",
          }
        : undefined;

    await client.restoreBackup(serverId, backupId, backup.storageLocation, s3Config);

    await logAudit({
      action: "backup_restore",
      userId: c.get("user")?.id ?? "",
      targetId: backupId,
      metadata: { serverId, name: backup.name },
    });

    return c.json({ message: "Restore completed. Server is stopped." });
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

// Delete a backup
backups.delete("/:backupId", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const backupId = c.req.param("backupId") ?? "";

  const server = await getServerForBackupOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  const [backup] = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.id, backupId))
    .limit(1);
  if (!backup)
    return c.json({ error: { code: "BACKUP_NOT_FOUND", message: "Backup not found" } }, 404);

  if (backup.status === "in_progress")
    return c.json(
      {
        error: {
          code: "BACKUP_IN_PROGRESS",
          message: "Cannot delete a backup that is in progress",
        },
      },
      409,
    );

  // Delete from daemon storage
  try {
    const client = await createDaemonClient(server.nodeId);
    const storageConfig = await getStorageConfig(server.nodeId);
    const s3Config =
      backup.storageLocation === "s3" && storageConfig
        ? {
            endpoint: storageConfig.s3Endpoint ?? "",
            bucket: storageConfig.s3Bucket ?? "",
            accessKey: storageConfig.s3AccessKey ?? "",
            secretKey: storageConfig.s3SecretKey ?? "",
            region: storageConfig.s3Region ?? "",
          }
        : undefined;

    await client.deleteBackup(serverId, backupId, backup.storageLocation, s3Config);
  } catch (err) {
    // If daemon fails, still remove the record — the file might already be gone
    console.error("Failed to delete backup from daemon:", err);
  }

  // Remove from database
  await db.delete(schema.backups).where(eq(schema.backups.id, backupId));

  await logAudit({
    action: "backup_delete",
    userId: c.get("user")?.id ?? "",
    targetId: backupId,
    metadata: { serverId, name: backup.name },
  });

  return c.body(null, 204);
});

export default backups;
