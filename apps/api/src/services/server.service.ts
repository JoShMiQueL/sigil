import { db, schema } from "@sigil/db";
import type {
  ContainerState,
  LifecycleResponse,
  ServerConfiguration,
  ServerCreateInput,
  ServerLifecycleStatus,
  ServerListResponse,
  ServerRecord,
} from "@sigil/shared";
import { and, count, eq } from "drizzle-orm";
import { autoAssignAllocation, releaseAllocations } from "./allocation.service";
import { createDaemonClient, DaemonError } from "./daemon-client.service";
import { emit } from "./sse.service";

function toServer(row: typeof schema.servers.$inferSelect): ServerRecord {
  return {
    id: row.id,
    name: row.name,
    nodeId: row.nodeId,
    templateId: row.templateId,
    allocationId: row.allocationId,
    status: row.status as ServerLifecycleStatus,
    config: row.config as ServerConfiguration,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDaemonState(state: ContainerState): ServerLifecycleStatus {
  switch (state) {
    case "creating":
      return "starting";
    case "running":
      return "running";
    case "stopped":
      return "stopped";
    case "crashed":
      return "crashed";
    case "removing":
      return "offline";
    case "missing":
      return "crashed";
  }
}

const VALID_START_STATES: ServerLifecycleStatus[] = [
  "offline",
  "stopped",
  "crashed",
  "creation_failed",
];
const VALID_STOP_STATES: ServerLifecycleStatus[] = ["running"];
const VALID_RESTART_STATES: ServerLifecycleStatus[] = ["running", "stopped", "crashed"];

export async function createServer(
  input: ServerCreateInput,
): Promise<ServerRecord | { error: string; code: string }> {
  // Validate node exists
  const [node] = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, input.nodeId))
    .limit(1);
  if (!node) return { error: "Node not found", code: "NODE_NOT_FOUND" };

  // Validate template exists and is active
  const [template] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.id, input.templateId))
    .limit(1);
  if (!template) return { error: "Template not found", code: "TEMPLATE_NOT_FOUND" };
  if (!template.active) return { error: "Template is not activated", code: "TEMPLATE_INACTIVE" };

  // Check for duplicate name on this node
  const [existing] = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .where(and(eq(schema.servers.nodeId, input.nodeId), eq(schema.servers.name, input.name)))
    .limit(1);
  if (existing) return { error: "Server name already exists on this node", code: "DUPLICATE_NAME" };

  // Auto-assign a primary allocation
  const serverId = crypto.randomUUID();
  const allocResult = await autoAssignAllocation(input.nodeId, serverId);
  if ("error" in allocResult) {
    return { error: allocResult.error, code: allocResult.code };
  }
  const allocation = allocResult;

  // Build ServerConfiguration from template
  const environment: Record<string, string> = {};
  const templateEnv = template.environment as Record<string, { defaultValue?: string }> | null;
  if (templateEnv) {
    for (const [key, val] of Object.entries(templateEnv)) {
      if (input.variables[key]) {
        environment[key] = input.variables[key];
      } else if (val?.defaultValue) {
        environment[key] = val.defaultValue;
      }
    }
  }

  const portMappings = (template.portMappings as ServerConfiguration["portMappings"]) ?? [];
  const resourceLimits = (template.resourceLimits as ServerConfiguration["resourceLimits"]) ?? {
    memoryMb: 1024,
    cpuLimit: 1,
  };

  const config: ServerConfiguration = {
    serverId,
    image: template.image,
    startupCommand: template.startupCommand,
    environment,
    portMappings: portMappings.map((pm) => ({
      hostIp: allocation.ip,
      hostPort: allocation.port,
      containerPort: pm.containerPort,
      protocol: pm.protocol,
    })),
    resourceLimits,
    volumePath: `${process.env.SIGIL_VOLUME_BASE_PATH ?? "/var/lib/sigil/volumes"}/${serverId}`,
  };

  // Create server record with status "offline"
  const [row] = await db
    .insert(schema.servers)
    .values({
      id: serverId,
      name: input.name,
      nodeId: input.nodeId,
      templateId: input.templateId,
      allocationId: allocation.id,
      status: "offline",
      config,
    })
    .returning();

  // Dispatch to daemon to create the container
  let daemonState: ContainerState | undefined;
  try {
    const client = await createDaemonClient(input.nodeId);
    const result = await client.createServer(config);
    daemonState = result.state;
  } catch (err) {
    // Mark as creation_failed if daemon rejects
    await db
      .update(schema.servers)
      .set({ status: "creation_failed", updatedAt: new Date() })
      .where(eq(schema.servers.id, serverId));

    // Release the allocation since creation failed
    await releaseAllocations(serverId);

    if (err instanceof DaemonError) {
      return { error: err.message, code: err.code };
    }
    return { error: (err as Error).message, code: "DAEMON_UNREACHABLE" };
  }

  // Update server status based on daemon's response
  let finalRow = row;
  if (daemonState) {
    const newStatus = mapDaemonState(daemonState);
    const [updated] = await db
      .update(schema.servers)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(schema.servers.id, serverId))
      .returning();
    if (updated) finalRow = updated;
  }

  const server = toServer(finalRow);
  emit("server.create", {
    serverId: server.id,
    nodeId: server.nodeId,
    name: server.name,
    status: server.status,
  });

  return server;
}

export async function getServer(serverId: string): Promise<ServerRecord | null> {
  const [row] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  return row ? toServer(row) : null;
}

export async function listServers(
  nodeId?: string,
  status?: string,
  limit = 50,
  offset = 0,
): Promise<ServerListResponse> {
  const conditions = [];
  if (nodeId) conditions.push(eq(schema.servers.nodeId, nodeId));
  if (status) conditions.push(eq(schema.servers.status, status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = where
    ? await db
        .select()
        .from(schema.servers)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(schema.servers.createdAt)
    : await db
        .select()
        .from(schema.servers)
        .limit(limit)
        .offset(offset)
        .orderBy(schema.servers.createdAt);

  const [countRow] = where
    ? await db.select({ total: count() }).from(schema.servers).where(where)
    : await db.select({ total: count() }).from(schema.servers);

  return {
    servers: rows.map(toServer),
    total: countRow?.total ?? 0,
  };
}

export async function deleteServer(
  serverId: string,
): Promise<{ ok: true } | { error: string; code: string }> {
  const server = await getServer(serverId);
  if (!server) return { error: "Server not found", code: "SERVER_NOT_FOUND" };

  // Send remove command to daemon first (no orphaned containers)
  try {
    const client = await createDaemonClient(server.nodeId);
    await client.removeServer(serverId);
  } catch (err) {
    if (err instanceof DaemonError) {
      return { error: err.message, code: err.code };
    }
    return { error: (err as Error).message, code: "DAEMON_UNREACHABLE" };
  }

  // Release allocations
  await releaseAllocations(serverId);

  // Delete the server record
  await db.delete(schema.servers).where(eq(schema.servers.id, serverId));

  emit("server.delete", {
    serverId,
    nodeId: server.nodeId,
    deleted: true,
  });

  return { ok: true };
}

export async function powerAction(
  serverId: string,
  action: "start" | "stop" | "restart",
): Promise<ServerRecord | { error: string; code: string }> {
  const server = await getServer(serverId);
  if (!server) return { error: "Server not found", code: "SERVER_NOT_FOUND" };

  // Validate state transition
  const validStates =
    action === "start"
      ? VALID_START_STATES
      : action === "stop"
        ? VALID_STOP_STATES
        : VALID_RESTART_STATES;

  if (!validStates.includes(server.status)) {
    return {
      error: `Cannot ${action} a server in "${server.status}" state`,
      code: "INVALID_STATE_TRANSITION",
    };
  }

  // Set intermediate state
  const intermediateStatus: ServerLifecycleStatus =
    action === "start" ? "starting" : action === "stop" ? "stopping" : "stopping";
  await db
    .update(schema.servers)
    .set({ status: intermediateStatus, updatedAt: new Date() })
    .where(eq(schema.servers.id, serverId));

  try {
    const client = await createDaemonClient(server.nodeId);
    let result: LifecycleResponse;
    if (action === "start") {
      result = await client.startServer(serverId);
    } else if (action === "stop") {
      result = await client.stopServer(serverId);
    } else {
      // restart: stop then start
      await client.stopServer(serverId);
      result = await client.startServer(serverId);
    }

    // Update status based on daemon response
    const newStatus = mapDaemonState(result.state);
    await db
      .update(schema.servers)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(schema.servers.id, serverId));

    const updated = await getServer(serverId);
    if (updated) {
      emit("server.update", {
        serverId,
        nodeId: server.nodeId,
        status: newStatus,
        previousStatus: server.status,
      });
    }
    return updated ?? server;
  } catch (err) {
    // Revert to original status on failure
    await db
      .update(schema.servers)
      .set({ status: server.status, updatedAt: new Date() })
      .where(eq(schema.servers.id, serverId));

    if (err instanceof DaemonError) {
      return { error: err.message, code: err.code };
    }
    return { error: (err as Error).message, code: "DAEMON_UNREACHABLE" };
  }
}

export async function updateServerState(serverId: string, newState: ContainerState): Promise<void> {
  const server = await getServer(serverId);
  if (!server) {
    // Ignore state reports for non-existent servers (FR-017)
    return;
  }

  const newStatus = mapDaemonState(newState);
  if (newStatus === server.status) return; // No change

  await db
    .update(schema.servers)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(schema.servers.id, serverId));

  emit("server.update", {
    serverId,
    nodeId: server.nodeId,
    status: newStatus,
    previousStatus: server.status,
  });
}
