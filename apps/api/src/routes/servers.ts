import { zValidator } from "@hono/zod-validator";
import { CreateServerRequestSchema } from "@sigilpanel/shared";
import { type Context, Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import { createDaemonClient, DaemonError } from "../services/daemon-client.service";

const servers = new Hono<AuthContext>();

// Admin-only guard
servers.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

// Create a server on a node
servers.post("/", zValidator("json", CreateServerRequestSchema), async (c) => {
  const config = c.req.valid("json");
  const nodeId = c.req.query("node_id");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    const result = await client.createServer(config);

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "server_create",
      targetType: "server",
      targetId: config.serverId,
      metadata: { nodeId, image: config.image },
    });

    return c.json(result, 201);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// Start a server
servers.post("/:serverId/start", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    const result = await client.startServer(serverId);

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "server_start",
      targetType: "server",
      targetId: serverId,
      metadata: { nodeId },
    });

    return c.json(result);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// Stop a server
servers.post("/:serverId/stop", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    const result = await client.stopServer(serverId);

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "server_stop",
      targetType: "server",
      targetId: serverId,
      metadata: { nodeId },
    });

    return c.json(result);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// Restart a server
servers.post("/:serverId/restart", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    const result = await client.restartServer(serverId);

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "server_restart",
      targetType: "server",
      targetId: serverId,
      metadata: { nodeId },
    });

    return c.json(result);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// Remove a server
servers.delete("/:serverId", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    await client.removeServer(serverId);

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "server_delete",
      targetType: "server",
      targetId: serverId,
      metadata: { nodeId },
    });

    return c.body(null, 204);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// Get server status
servers.get("/:serverId", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    const result = await client.getServerStatus(serverId);
    return c.json(result);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// List servers on a node
servers.get("/", async (c) => {
  const nodeId = c.req.query("node_id");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    const result = await client.listServers();
    return c.json(result);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// Write a file to a server volume (through jail)
servers.post("/:serverId/files/write", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  const body = await c.req.json();
  if (!body.path || body.data === undefined) {
    return c.json({ error: { code: "INVALID_REQUEST", message: "path and data required" } }, 400);
  }

  try {
    const client = await createDaemonClient(nodeId);
    await client.writeFile(serverId, body.path, body.data);
    return c.body(null, 204);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// Read a file from a server volume (through jail)
servers.get("/:serverId/files/read", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");
  const path = c.req.query("path");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  if (!path) {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "path query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    const result = await client.readFile(serverId, path);
    return c.json(result);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// List files in a server volume (through jail)
servers.get("/:serverId/files/list", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");
  const path = c.req.query("path") || ".";

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    const result = await client.listFiles(serverId, path);
    return c.json(result);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

// Delete a file from a server volume (through jail)
servers.delete("/:serverId/files/delete", async (c) => {
  const serverId = c.req.param("serverId");
  const nodeId = c.req.query("node_id");
  const path = c.req.query("path");

  if (!nodeId) {
    return c.json(
      { error: { code: "MISSING_NODE", message: "node_id query param required" } },
      400,
    );
  }

  if (!path) {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "path query param required" } },
      400,
    );
  }

  try {
    const client = await createDaemonClient(nodeId);
    await client.deleteFile(serverId, path);
    return c.body(null, 204);
  } catch (err) {
    return handleDaemonError(c, err);
  }
});

function handleDaemonError(c: Context, err: unknown): Response {
  if (err instanceof DaemonError) {
    const status = err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 502;
    return c.json(
      { error: { code: err.code, message: err.message } },
      status as 400 | 404 | 409 | 502,
    );
  }
  return c.json({ error: { code: "DAEMON_UNREACHABLE", message: (err as Error).message } }, 502);
}

export default servers;
