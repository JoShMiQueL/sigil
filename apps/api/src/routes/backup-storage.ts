import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@sigil/db";
import { UpdateBackupStorageConfigInputSchema } from "@sigil/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import { createDaemonClient, DaemonError } from "../services/daemon-client.service";

const backupStorage = new Hono<AuthContext>();

// Admin-only guard
backupStorage.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: { code: "FORBIDDEN", message: "Forbidden" } }, 403);
  }
  await next();
});

// Helper: look up node and verify it exists
async function getNode(nodeId: string) {
  const [node] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nodeId)).limit(1);
  return node;
}

// Helper: get existing config or return null
async function getStorageConfig(nodeId: string) {
  const [config] = await db
    .select()
    .from(schema.backupStorageConfigs)
    .where(eq(schema.backupStorageConfigs.nodeId, nodeId))
    .limit(1);
  return config;
}

// Get storage config for a node
backupStorage.get("/", async (c) => {
  const nodeId = c.req.param("nodeId") ?? "";
  const node = await getNode(nodeId);
  if (!node) return c.json({ error: { code: "NODE_NOT_FOUND", message: "Node not found" } }, 404);

  let config = await getStorageConfig(nodeId);
  if (!config) {
    // Create default config
    [config] = await db
      .insert(schema.backupStorageConfigs)
      .values({ nodeId, backend: "local", maxBackupSizeGb: 10 })
      .returning();
  }

  return c.json({
    nodeId: config.nodeId,
    backend: config.backend,
    localPath: config.localPath,
    s3Endpoint: config.s3Endpoint,
    s3Bucket: config.s3Bucket,
    s3AccessKey: config.s3AccessKey,
    s3Region: config.s3Region,
    maxBackupSizeGb: config.maxBackupSizeGb,
  });
});

// Update storage config for a node
backupStorage.put("/", zValidator("json", UpdateBackupStorageConfigInputSchema), async (c) => {
  const nodeId = c.req.param("nodeId") ?? "";
  const input = c.req.valid("json");

  const node = await getNode(nodeId);
  if (!node) return c.json({ error: { code: "NODE_NOT_FOUND", message: "Node not found" } }, 404);

  const existing = await getStorageConfig(nodeId);

  const values = {
    backend: input.backend,
    localPath: input.localPath ?? null,
    s3Endpoint: input.s3Endpoint ?? null,
    s3Bucket: input.s3Bucket ?? null,
    s3AccessKey: input.s3AccessKey ?? null,
    s3SecretKey: input.s3SecretKey ?? existing?.s3SecretKey ?? null,
    s3Region: input.s3Region ?? null,
    maxBackupSizeGb: input.maxBackupSizeGb ?? 10,
    updatedAt: new Date(),
  };

  const config = existing
    ? (
        await db
          .update(schema.backupStorageConfigs)
          .set(values)
          .where(eq(schema.backupStorageConfigs.nodeId, nodeId))
          .returning()
      )[0]
    : (
        await db
          .insert(schema.backupStorageConfigs)
          .values({ nodeId, ...values })
          .returning()
      )[0];

  await logAudit({
    action: "backup_create",
    userId: c.get("user")?.id ?? "",
    targetId: nodeId,
    metadata: { backend: input.backend },
  });

  return c.json({
    nodeId: config.nodeId,
    backend: config.backend,
    localPath: config.localPath,
    s3Endpoint: config.s3Endpoint,
    s3Bucket: config.s3Bucket,
    s3AccessKey: config.s3AccessKey,
    s3Region: config.s3Region,
    maxBackupSizeGb: config.maxBackupSizeGb,
  });
});

// Test S3 connectivity without saving
backupStorage.post("/test", zValidator("json", UpdateBackupStorageConfigInputSchema), async (c) => {
  const nodeId = c.req.param("nodeId") ?? "";
  const input = c.req.valid("json");

  const node = await getNode(nodeId);
  if (!node) return c.json({ error: { code: "NODE_NOT_FOUND", message: "Node not found" } }, 404);

  if (input.backend !== "s3") {
    return c.json({ ok: true, message: "local backend requires no connectivity test" });
  }

  // For S3, we would test connectivity through the daemon
  // For now, just validate the config fields are present
  if (!input.s3Endpoint || !input.s3Bucket || !input.s3AccessKey || !input.s3SecretKey) {
    return c.json(
      {
        error: {
          code: "INVALID_CONFIG",
          message: "S3 backend requires endpoint, bucket, access key, and secret key",
        },
      },
      400,
    );
  }

  try {
    await createDaemonClient(nodeId);
    // The daemon would test S3 connectivity here
    // For now, we just validate the config is syntactically correct
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof DaemonError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.statusCode },
      );
    }
    return Response.json(
      { error: { code: "S3_CONNECTION_FAILED", message: (err as Error).message } },
      { status: 502 },
    );
  }
});

export default backupStorage;
