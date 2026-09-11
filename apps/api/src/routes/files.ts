import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@sigil/db";
import { FileCreateInputSchema, FileRenameInputSchema } from "@sigil/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { createDaemonClient, DaemonError } from "../services/daemon-client.service";

const files = new Hono<AuthContext>();

// Admin-only guard
files.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: { code: "FORBIDDEN", message: "Forbidden" } }, 403);
  }
  await next();
});

// Helper: look up server and verify it exists
async function getServerForFileOp(serverId: string) {
  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  return server;
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

// List directory
files.get("/", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const path = c.req.query("path") ?? ".";
  const server = await getServerForFileOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  try {
    const client = await createDaemonClient(server.nodeId);
    const result = await client.listFiles(serverId, path);
    return c.json(result);
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

// Read file content
files.get("/read", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const path = c.req.query("path") ?? "";
  if (!path) return c.json({ error: { code: "INVALID_PATH", message: "path required" } }, 400);

  const server = await getServerForFileOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  try {
    const client = await createDaemonClient(server.nodeId);
    const result = await client.readFile(serverId, path);
    if (result.size > 1048576) {
      return c.json(
        { error: { code: "FILE_TOO_LARGE", message: "File exceeds 1MB edit limit" } },
        413,
      );
    }
    return c.json({ ...result, encoding: "utf-8" as const });
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

// Write file content
files.put("/write", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const path = c.req.query("path") ?? "";
  if (!path) return c.json({ error: { code: "INVALID_PATH", message: "path required" } }, 400);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.content !== "string") {
    return c.json({ error: { code: "INVALID_BODY", message: "content required" } }, 400);
  }
  if (body.content.length > 1048576) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Content exceeds 1MB limit" } }, 413);
  }

  const server = await getServerForFileOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  try {
    const client = await createDaemonClient(server.nodeId);
    await client.writeFile(serverId, path, body.content);
    return c.body(null, 204);
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

// Create file or directory
files.post("/create", zValidator("json", FileCreateInputSchema), async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const input = c.req.valid("json");

  const server = await getServerForFileOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  try {
    const client = await createDaemonClient(server.nodeId);
    if (input.type === "directory") {
      await client.mkdir(serverId, input.path);
    } else {
      await client.writeFile(serverId, input.path, "");
    }
    return c.json({ path: input.path }, 201);
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

// Delete file or directory
files.delete("/", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const path = c.req.query("path") ?? "";
  if (!path) return c.json({ error: { code: "INVALID_PATH", message: "path required" } }, 400);

  const server = await getServerForFileOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  try {
    const client = await createDaemonClient(server.nodeId);
    await client.deleteFile(serverId, path);
    return c.body(null, 204);
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

// Rename file or directory
files.post("/rename", zValidator("json", FileRenameInputSchema), async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const input = c.req.valid("json");

  const server = await getServerForFileOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  try {
    const client = await createDaemonClient(server.nodeId);
    await client.renameFile(serverId, input.from, input.to);
    return c.body(null, 204);
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

// Upload file (multipart)
files.post("/upload", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const dir = c.req.query("path") ?? ".";
  const overwrite = c.req.query("overwrite") === "true";

  const server = await getServerForFileOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: { code: "INVALID_BODY", message: "file field required" } }, 400);
    }
    if (file.size > 100 * 1024 * 1024) {
      return c.json(
        { error: { code: "FILE_TOO_LARGE", message: "File exceeds 100MB upload limit" } },
        413,
      );
    }

    const client = await createDaemonClient(server.nodeId);

    // Check if file exists (unless overwrite=true)
    if (!overwrite) {
      const destPath = dir === "." ? file.name : `${dir}/${file.name}`;
      try {
        await client.readFile(serverId, destPath);
        return c.json({ error: { code: "FILE_EXISTS", message: "File already exists" } }, 409);
      } catch {
        // File doesn't exist — proceed
      }
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const result = await client.uploadFile(serverId, dir, file.name, data);
    return c.json(result, 201);
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

// Download file
files.get("/download", async (c) => {
  const serverId = c.req.param("serverId") ?? "";
  const path = c.req.query("path") ?? "";
  if (!path) return c.json({ error: { code: "INVALID_PATH", message: "path required" } }, 400);

  const server = await getServerForFileOp(serverId);
  if (!server)
    return c.json({ error: { code: "SERVER_NOT_FOUND", message: "Server not found" } }, 404);

  try {
    const client = await createDaemonClient(server.nodeId);
    const resp = await client.downloadFile(serverId, path);
    const data = await resp.arrayBuffer();
    const basename = path.split("/").pop() ?? path;
    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${basename}"`,
      },
    });
  } catch (err) {
    return daemonErrorResponse(err);
  }
});

export default files;
