import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@sigil/db";
import type { ServerRecord } from "@sigil/shared";
import { ServerCreateInputSchema, ServerPowerActionSchema } from "@sigil/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { signConsoleToken } from "../lib/console-token";
import type { AuthContext } from "../middleware/auth";
import { requireServerPermission } from "../middleware/server-permission";
import { logAudit } from "../services/audit.service";
import {
  createServer,
  deleteServer,
  getServer,
  listServers,
  powerAction,
} from "../services/server.service";

const servers = new Hono<AuthContext>();

// Admin-only guard for mutating routes (create, delete, power)
// GET routes (list, detail) are permission-aware and allow non-admin members
// Sub-routes (files, backups, members) are mounted separately and have their own guards
servers.use("*", async (c, next) => {
  const user = c.get("user");

  const method = c.req.method;
  const path = c.req.path;

  // Skip guard for sub-routes (files, backups, members) — they have their own guards
  if (/\/(files|backups|members)/.test(path)) {
    await next();
    return;
  }

  if (!user) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // Admins can do everything
  if (user.role === "admin") {
    await next();
    return;
  }

  // Non-admins: allow GET (list, detail) — permission checked per-route
  if (method === "GET") {
    await next();
    return;
  }

  // Allow console-token and power actions for non-admins (permission middleware on the route)
  if (method === "POST" && /\/(console-token|power)$/.test(path)) {
    await next();
    return;
  }

  return c.json({ error: { code: "FORBIDDEN", message: "Admin access required" } }, 403);
});

// Create a server
servers.post("/", zValidator("json", ServerCreateInputSchema), async (c) => {
  const input = c.req.valid("json");
  const user = c.get("user");
  let result: ServerRecord | { error: string; code: string };
  try {
    result = await createServer(input, user?.id);
  } catch (err) {
    console.error("Server creation error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: (err as Error).message } }, 500);
  }

  if ("error" in result) {
    const status =
      result.code === "NO_AVAILABLE_ALLOCATIONS" ||
      result.code === "DUPLICATE_NAME" ||
      result.code === "TEMPLATE_INACTIVE"
        ? 409
        : 502;
    return c.json(
      { error: { code: result.code, message: result.error } },
      status as 400 | 404 | 409 | 502,
    );
  }

  await logAudit({
    userId: user?.id,
    action: "server_create",
    targetType: "server",
    targetId: result.id,
    metadata: { nodeId: result.nodeId, name: result.name },
  });

  return c.json(result, 201);
});

// List servers
servers.get("/", async (c) => {
  const nodeId = c.req.query("nodeId");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const user = c.get("user");

  const result = await listServers(nodeId, status, limit, offset, user?.id, user?.role);
  return c.json(result, 200);
});

// Get server detail
servers.get("/:serverId", async (c) => {
  const serverId = c.req.param("serverId");
  const server = await getServer(serverId);

  if (!server) {
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);
  }

  // Non-admins must be a member
  const user = c.get("user");
  if (user && user.role !== "admin") {
    const [member] = await db
      .select({ id: schema.serverMembers.id })
      .from(schema.serverMembers)
      .where(
        and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.userId, user.id)),
      )
      .limit(1);
    if (!member) {
      return c.json({ error: { code: "FORBIDDEN", message: "Not a member of this server" } }, 403);
    }
  }

  return c.json(server, 200);
});

// Issue a console token for WebSocket connection to daemon
servers.post("/:serverId/console-token", requireServerPermission("console"), async (c) => {
  const serverId = c.req.param("serverId");
  if (!serverId) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId" } }, 400);
  }
  const server = await getServer(serverId);

  if (!server) {
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);
  }

  if (server.status !== "running" && server.status !== "starting") {
    return c.json(
      {
        error: { code: "SERVER_NOT_RUNNING", message: "Server must be running to use the console" },
      },
      409,
    );
  }

  const user = c.get("user");
  if (!user) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const token = await signConsoleToken(serverId, user.id);
  const daemonPort = process.env.DAEMON_PORT ?? "8080";

  // Look up the node to get the real IP
  const [node] = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId))
    .limit(1);
  const nodeIp = node?.ipAddress ?? "127.0.0.1";
  const daemonUrl = `ws://${nodeIp}:${daemonPort}/ws/servers/${serverId}/console`;

  await logAudit({
    userId: user.id,
    action: "server_console_token",
    targetType: "server",
    targetId: serverId,
    metadata: {},
  });

  return c.json(
    {
      token,
      daemonUrl,
      serverId,
      expiresIn: 300,
    },
    200,
  );
});

// Power action (start/stop/restart)
servers.post(
  "/:serverId/power",
  requireServerPermission("power"),
  zValidator("json", z.object({ action: ServerPowerActionSchema })),
  async (c) => {
    const serverId = c.req.param("serverId");
    if (!serverId) {
      return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId" } }, 400);
    }
    const { action } = c.req.valid("json");

    let result: ServerRecord | { error: string; code: string };
    try {
      result = await powerAction(serverId, action);
    } catch (err) {
      console.error("Power action error:", err);
      return c.json({ error: { code: "INTERNAL_ERROR", message: (err as Error).message } }, 500);
    }

    if ("error" in result) {
      const status = result.code === "INVALID_STATE_TRANSITION" ? 409 : 502;
      return c.json(
        { error: { code: result.code, message: result.error } },
        status as 400 | 404 | 409 | 502,
      );
    }

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: `server_${action}` as "server_start" | "server_stop" | "server_restart",
      targetType: "server",
      targetId: serverId,
      metadata: { nodeId: result.nodeId },
    });

    return c.json({ serverId: result.id, status: result.status }, 200);
  },
);

// Delete a server
servers.delete("/:serverId", async (c) => {
  const serverId = c.req.param("serverId");

  let result: { ok: true } | { error: string; code: string };
  try {
    result = await deleteServer(serverId);
  } catch (err) {
    console.error("Server deletion error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: (err as Error).message } }, 500);
  }

  if ("error" in result) {
    const status = result.code === "SERVER_NOT_FOUND" ? 404 : 502;
    return c.json(
      { error: { code: result.code, message: result.error } },
      status as 400 | 404 | 502,
    );
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "server_delete",
    targetType: "server",
    targetId: serverId,
    metadata: {},
  });

  return c.body(null, 204);
});

export default servers;
