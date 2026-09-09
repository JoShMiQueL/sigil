import { zValidator } from "@hono/zod-validator";
import { PairingRequestSchema, PairingTokenCreateSchema } from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
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

  return c.json(
    {
      nodeId: result.nodeId,
      secretId: result.secretId,
      secret: result.secret,
    },
    201,
  );
});

export default pairing;
export { adminPairing };
