import { zValidator } from "@hono/zod-validator";
import { ApiKeyCreateSchema } from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/api-key.service";

const apiKeys = new Hono<AuthContext>();

apiKeys.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

apiKeys.post("/", zValidator("json", ApiKeyCreateSchema), async (c) => {
  const user = c.get("user")!;
  const { name, scopes } = c.req.valid("json");

  const result = await createApiKey(user.id, name, scopes);
  return c.json(result, 201);
});

apiKeys.get("/", async (c) => {
  const user = c.get("user")!;
  const keys = await listApiKeys(user.id);
  return c.json({ keys });
});

apiKeys.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const revoked = await revokeApiKey(user.id, id);
  if (!revoked) {
    return c.json({ error: "API key not found" }, 404);
  }
  return c.json({ status: "ok" });
});

export default apiKeys;
