import { zValidator } from "@hono/zod-validator";
import {
  HeartbeatPayloadSchema,
  PairingRequestSchema,
  PairingTokenCreateSchema,
} from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { type NodeAuthContext, nodeAuthMiddleware } from "../middleware/node-auth";
import { logAudit } from "../services/audit.service";
import { processHeartbeat } from "../services/heartbeat.service";
import {
  consumePairingToken,
  generatePairingToken,
  listPairingTokens,
} from "../services/pairing.service";

const pairing = new Hono<AuthContext>();

// Admin-only routes
const adminPairing = new Hono<AuthContext>();

adminPairing.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

adminPairing.post("/tokens", zValidator("json", PairingTokenCreateSchema), async (c) => {
  const input = c.req.valid("json");
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await generatePairingToken(input.regionId, user.id);
  await logAudit({
    userId: user.id,
    action: "pairing_token_generate",
    targetType: "region",
    targetId: input.regionId,
    metadata: { tokenId: result.id },
  });
  return c.json(
    {
      id: result.id,
      token: result.token,
      regionId: result.regionId,
      expiresAt: result.expiresAt.toISOString(),
    },
    201,
  );
});

adminPairing.get("/tokens", async (c) => {
  const tokens = await listPairingTokens();
  return c.json(tokens);
});

// Daemon routes (no admin auth — uses pairing token or node credentials)
pairing.post("/node/register", zValidator("json", PairingRequestSchema), async (c) => {
  const input = c.req.valid("json");

  const result = await consumePairingToken(input.pairingToken, {
    hostname: input.hostname,
    ipAddress: input.ipAddress,
    capabilities: input.capabilities,
  });

  if ("error" in result) {
    return c.json({ error: { code: "PAIRING_TOKEN_INVALID", message: result.error } }, 401);
  }

  await logAudit({
    action: "node_register",
    targetType: "node",
    targetId: result.nodeId,
    metadata: { hostname: input.hostname, ipAddress: input.ipAddress },
    ipAddress: input.ipAddress,
  });

  return c.json(
    {
      nodeId: result.nodeId,
      secretId: result.secretId,
      secret: result.secret,
    },
    201,
  );
});

// Daemon heartbeat route (requires node credentials)
const heartbeatApp = new Hono<NodeAuthContext>();
heartbeatApp.use("/node/heartbeat", nodeAuthMiddleware);
heartbeatApp.post("/node/heartbeat", zValidator("json", HeartbeatPayloadSchema), async (c) => {
  const nodeId = c.get("nodeId");
  if (!nodeId) {
    return c.json({ error: { code: "NODE_AUTH_FAILED", message: "Invalid credentials" } }, 401);
  }

  const payload = c.req.valid("json");
  await processHeartbeat(nodeId, payload);

  return c.body(null, 204);
});

export default pairing;
export { adminPairing, heartbeatApp };
