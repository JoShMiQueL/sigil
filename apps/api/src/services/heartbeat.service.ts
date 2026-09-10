import { db, schema } from "@sigilpanel/db";
import type { HeartbeatPayload } from "@sigilpanel/shared";
import { eq, lt } from "drizzle-orm";
import { getNodeById } from "./node.service";
import { emit } from "./sse.service";

const HEARTBEAT_TIMEOUT_SEC = 90;

export async function processHeartbeat(nodeId: string, payload: HeartbeatPayload): Promise<void> {
  await db
    .update(schema.nodes)
    .set({
      status: payload.dockerAvailable ? "online" : "degraded",
      cpuUsage: payload.cpuUsage,
      memoryUsage: payload.memoryUsage,
      diskUsage: payload.diskUsage,
      containerCount: payload.containerCount,
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.nodes.id, nodeId));

  const node = await getNodeById(nodeId);
  if (node) emit("node.update", node);
}

export async function sweepOfflineNodes(): Promise<number> {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_SEC * 1000);

  const offlineNodes = await db
    .select({ id: schema.nodes.id })
    .from(schema.nodes)
    .where(lt(schema.nodes.lastHeartbeatAt, cutoff));

  if (offlineNodes.length === 0) return 0;

  for (const node of offlineNodes) {
    await db
      .update(schema.nodes)
      .set({ status: "offline", updatedAt: new Date() })
      .where(eq(schema.nodes.id, node.id));

    const fullNode = await getNodeById(node.id);
    if (fullNode) emit("node.update", fullNode);
  }

  return offlineNodes.length;
}

let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startHeartbeatSweep(intervalSec = 30): void {
  if (sweepInterval) return;

  sweepInterval = setInterval(async () => {
    try {
      await sweepOfflineNodes();
    } catch (err) {
      console.error("Heartbeat sweep failed:", err);
    }
  }, intervalSec * 1000);
}

export function stopHeartbeatSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}
