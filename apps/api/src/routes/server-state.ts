import { zValidator } from "@hono/zod-validator";
import { StateChangeEventSchema } from "@sigil/shared";
import { Hono } from "hono";
import { type NodeAuthContext, nodeAuthMiddleware } from "../middleware/node-auth";
import { updateServerState } from "../services/server.service";
import { emitServerStateEvent } from "../services/server-state.service";

const serverStateApp = new Hono<NodeAuthContext>();

serverStateApp.use("/node/server-state", nodeAuthMiddleware);

serverStateApp.post(
  "/node/server-state",
  zValidator("json", StateChangeEventSchema, (result, c) => {
    if (!result.success) {
      const nodeId = c.req.header("x-node-id") ?? "unknown";
      console.warn(
        `Malformed state change rejected from node ${nodeId}:`,
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
  }),
  async (c) => {
    const nodeId = c.get("nodeId");
    if (!nodeId) {
      return c.json({ error: { code: "NODE_AUTH_FAILED", message: "Invalid credentials" } }, 401);
    }

    const event = c.req.valid("json");

    // Persist state change to server record (R9)
    await updateServerState(event.serverId, event.newState);

    // Emit SSE event to connected admin browsers
    emitServerStateEvent(event);

    console.log(
      `State change: server=${event.serverId} node=${nodeId} ${event.previousState}→${event.newState}${event.reason ? ` (${event.reason})` : ""}`,
    );

    return c.body(null, 204);
  },
);

export default serverStateApp;
