import { zValidator } from "@hono/zod-validator";
import { LoginRequestSchema } from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { login, logout } from "../services/auth.service";

const auth = new Hono<AuthContext>();

auth.post("/login", rateLimitMiddleware, zValidator("json", LoginRequestSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const ipAddress = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  const userAgent = c.req.header("user-agent");

  const result = await login(email, password, ipAddress, userAgent, c);

  if ("error" in result) {
    if (result.error === "2fa_required") {
      return c.json({ status: "2fa_required" }, 200);
    }
    const message = result.error === "suspended" ? "Account suspended" : "Invalid credentials";
    return c.json({ error: message }, 401);
  }

  return c.json({ status: "ok", user: result.user });
});

auth.post("/logout", async (c) => {
  await logout(c);
  return c.json({ status: "ok" });
});

auth.get("/me", (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({ user });
});

export default auth;
