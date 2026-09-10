import type { ApiKeyScope } from "@sigil/shared";
import { createMiddleware } from "hono/factory";
import type { AuthContext } from "./auth";

export function requireScopes(requiredScopes: ApiKeyScope[]) {
  return createMiddleware<AuthContext>(async (c, next) => {
    const authMethod = c.get("authMethod");

    // Session auth (cookie) has full access
    if (authMethod === "session") {
      await next();
      return;
    }

    // API key auth requires all specified scopes
    if (authMethod === "api-key") {
      const keyScopes = c.get("apiKeyScopes") ?? [];
      const hasAllScopes = requiredScopes.every((scope) => keyScopes.includes(scope));
      if (!hasAllScopes) {
        return c.json({ error: "Insufficient scopes" }, 403);
      }
      await next();
      return;
    }

    return c.json({ error: "Unauthorized" }, 401);
  });
}
