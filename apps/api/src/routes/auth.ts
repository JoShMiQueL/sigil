import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@sigilpanel/db";
import {
  LoginRequestSchema,
  PasswordResetRequestSchema,
  PasswordResetSchema,
  TotpDisableSchema,
  TotpEnableVerifySchema,
  TotpVerifySchema,
} from "@sigilpanel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { passwordResetEmail } from "../emails/password-reset";
import { sendEmail } from "../lib/email";
import type { AuthContext } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { login, logout, verify2fa } from "../services/auth.service";
import { createResetToken, resetPassword } from "../services/password.service";
import { disableTotp, enableTotp, verifyAndActivateTotp } from "../services/totp.service";

const auth = new Hono<AuthContext>();

auth.post("/login", rateLimitMiddleware, zValidator("json", LoginRequestSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const ipAddress = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  const userAgent = c.req.header("user-agent");

  const result = await login(email, password, ipAddress, userAgent, c);

  if ("error" in result) {
    if (result.error === "2fa_required") {
      return c.json({ status: "2fa_required", userId: result.userId }, 200);
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

auth.post("/forgot-password", zValidator("json", PasswordResetRequestSchema), async (c) => {
  const { email } = c.req.valid("json");

  // Always return 200 to prevent email enumeration
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

  if (user) {
    const { token } = await createResetToken(user.id);
    const panelUrl = process.env.PANEL_URL ?? "http://localhost:5173";
    const resetLink = `${panelUrl}/reset-password?token=${token}`;

    try {
      await sendEmail(passwordResetEmail(user.email, resetLink));
    } catch (err) {
      console.error("[forgot-password] Failed to send email:", err);
    }
  }

  return c.json({ status: "ok" });
});

auth.post("/reset-password", zValidator("json", PasswordResetSchema), async (c) => {
  const { token, password } = c.req.valid("json");

  const result = await resetPassword(token, password);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ status: "ok" });
});

// 2FA login verification
auth.post("/login/2fa", zValidator("json", TotpVerifySchema), async (c) => {
  const { userId, code } = c.req.valid("json");
  const ipAddress = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  const userAgent = c.req.header("user-agent");

  const result = await verify2fa(userId, code, ipAddress, userAgent, c);

  if ("error" in result) {
    return c.json({ error: result.error }, 401);
  }

  return c.json({ status: "ok", user: result.user });
});

// 2FA enrollment (requires auth)
auth.post("/2fa/enable", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const result = await enableTotp(user.id);
  return c.json(result);
});

// 2FA activation (requires auth + valid TOTP code)
auth.post("/2fa/verify", zValidator("json", TotpEnableVerifySchema), async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { code } = c.req.valid("json");
  const result = await verifyAndActivateTotp(user.id, code);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ status: "ok" });
});

// 2FA disable (requires auth + password)
auth.post("/2fa/disable", zValidator("json", TotpDisableSchema), async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { password } = c.req.valid("json");
  const result = await disableTotp(user.id, password);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ status: "ok" });
});

export default auth;
