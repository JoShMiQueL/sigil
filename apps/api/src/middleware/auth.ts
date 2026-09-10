import { db, schema } from "@sigil/db";
import type { ApiKeyScope, User } from "@sigil/shared";
import { eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { hashToken } from "../lib/token";

export type AuthContext = {
  Variables: {
    user: User | null;
    apiKeyScopes: ApiKeyScope[] | null;
    authMethod: "session" | "api-key" | null;
  };
};

export const authMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  c.set("user", null);
  c.set("apiKeyScopes", null);
  c.set("authMethod", null);

  // Try session cookie first
  const sessionToken = getCookie(c, "sigil_session");
  if (sessionToken) {
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token, sessionToken))
      .limit(1);

    if (session && session.expiresAt > new Date()) {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);

      if (user && user.status === "active") {
        c.set("user", {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role as "admin" | "user",
          status: user.status as "active" | "suspended",
          totpEnabled: user.totpEnabled,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        });
        c.set("authMethod", "session");
      }
    }
  }

  // Try API key Bearer token
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer sigil_")) {
    const key = authHeader.slice(7);
    const keyHash = hashToken(key);

    const [apiKey] = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.keyHash, keyHash))
      .limit(1);

    if (apiKey) {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, apiKey.userId))
        .limit(1);

      if (user && user.status === "active") {
        c.set("user", {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role as "admin" | "user",
          status: user.status as "active" | "suspended",
          totpEnabled: user.totpEnabled,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        });
        c.set("apiKeyScopes", (apiKey.scopes ?? []) as ApiKeyScope[]);
        c.set("authMethod", "api-key");

        // Update last used
        await db
          .update(schema.apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(schema.apiKeys.id, apiKey.id));
      }
    }
  }

  await next();
});
