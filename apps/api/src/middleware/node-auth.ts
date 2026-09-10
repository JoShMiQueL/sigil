import { db, schema } from "@sigil/db";
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { isTimestampValid, verifySignature } from "../lib/credentials";
import { decrypt } from "../lib/crypto";

export type NodeAuthContext = {
  Variables: {
    nodeId: string | null;
  };
};

export const nodeAuthMiddleware = createMiddleware<NodeAuthContext>(async (c, next) => {
  c.set("nodeId", null);

  const secretId = c.req.header("x-node-id");
  const signature = c.req.header("x-node-signature");
  const timestampStr = c.req.header("x-node-timestamp");

  if (!secretId || !signature || !timestampStr) {
    return c.json(
      { error: { code: "NODE_AUTH_FAILED", message: "Missing authentication headers" } },
      401,
    );
  }

  const timestamp = Number.parseInt(timestampStr, 10);
  if (Number.isNaN(timestamp) || !isTimestampValid(timestamp)) {
    return c.json(
      {
        error: {
          code: "TIMESTAMP_OUT_OF_WINDOW",
          message: "Timestamp must be within 60 seconds of server time",
        },
      },
      400,
    );
  }

  const [credential] = await db
    .select()
    .from(schema.nodeCredentials)
    .where(
      and(eq(schema.nodeCredentials.secretId, secretId), isNull(schema.nodeCredentials.revokedAt)),
    )
    .limit(1);

  if (!credential) {
    return c.json({ error: { code: "NODE_AUTH_FAILED", message: "Invalid credentials" } }, 401);
  }

  const body = await c.req.text();
  let secret: string;
  try {
    secret = decrypt(credential.secretEncrypted);
  } catch {
    return c.json({ error: { code: "NODE_AUTH_FAILED", message: "Invalid credentials" } }, 401);
  }

  if (!verifySignature(secret, signature, timestamp, body)) {
    return c.json({ error: { code: "NODE_AUTH_FAILED", message: "Invalid credentials" } }, 401);
  }

  c.set("nodeId", credential.nodeId);
  await next();
});
