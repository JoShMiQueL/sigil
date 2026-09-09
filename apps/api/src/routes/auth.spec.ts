import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock rate limiter to avoid Redis state interference between tests
vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: async (c: any, next: any) => {
    await next();
  },
  checkRateLimit: async () => true,
  recordFailedAttempt: async () => {},
}));

import app from "../index";
import {
  apiRequest,
  cleanupDatabase,
  createAdmin,
  createUser,
  extractCookie,
  generateResetToken,
  generateTotpCode,
  loginAndGetCookie,
  parseJson,
} from "../test/helpers";

describe("auth routes [US1: login/logout/me]", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("T030: login with valid credentials returns user and sets cookie", async () => {
    await createAdmin("admin1@test.local", "admin12345");

    const res = await apiRequest(app, "/api/auth/login", {
      method: "POST",
      body: { email: "admin1@test.local", password: "admin12345" },
    });

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.status).toBe("ok");
    expect(body.user.email).toBe("admin1@test.local");
    expect(res.headers.get("set-cookie")).toContain("sigil_session=");
  });

  it("T031: login with invalid credentials returns 401", async () => {
    await createAdmin("admin2@test.local", "admin12345");

    const res = await apiRequest(app, "/api/auth/login", {
      method: "POST",
      body: { email: "admin2@test.local", password: "wrongpassword" },
    });

    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error).toBe("Invalid credentials");
  });

  it("T031b: login with non-existent email returns 401", async () => {
    const res = await apiRequest(app, "/api/auth/login", {
      method: "POST",
      body: { email: "nobody@test.local", password: "anything" },
    });

    expect(res.status).toBe(401);
  });

  it("T032: logout destroys the session", async () => {
    await createAdmin("admin3@test.local", "admin12345");
    const { cookie } = await loginAndGetCookie(app, "admin3@test.local", "admin12345");
    expect(cookie).not.toBeNull();

    // Verify session works
    const meRes = await apiRequest(app, "/api/auth/me", { cookie });
    expect(meRes.status).toBe(200);

    // Logout
    const logoutRes = await apiRequest(app, "/api/auth/logout", { method: "POST", cookie });
    expect(logoutRes.status).toBe(200);

    // Session should no longer work
    const meRes2 = await apiRequest(app, "/api/auth/me", { cookie });
    expect(meRes2.status).toBe(401);
  });

  it("T033: /me returns current user with valid session", async () => {
    await createAdmin("admin4@test.local", "admin12345");
    const { cookie } = await loginAndGetCookie(app, "admin4@test.local", "admin12345");

    const res = await apiRequest(app, "/api/auth/me", { cookie });
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.user.email).toBe("admin4@test.local");
    expect(body.user.role).toBe("admin");
  });

  it("T033b: /me without session returns 401", async () => {
    const res = await apiRequest(app, "/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("auth routes [US3: password reset]", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("T068: forgot-password always returns 200 (no enumeration)", async () => {
    await createUser("exists@test.local", "userpass123");

    // Existing user
    const res1 = await apiRequest(app, "/api/auth/forgot-password", {
      method: "POST",
      body: { email: "exists@test.local" },
    });
    expect(res1.status).toBe(200);

    // Non-existent user - should still return 200
    const res2 = await apiRequest(app, "/api/auth/forgot-password", {
      method: "POST",
      body: { email: "nobody@test.local" },
    });
    expect(res2.status).toBe(200);
  });

  it("T069: reset-password with valid token succeeds", async () => {
    const userId = await createUser("reset@test.local", "oldpass123");
    const token = await generateResetToken(userId);

    const res = await apiRequest(app, "/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "newpass123" },
    });

    expect(res.status).toBe(200);

    // Can login with new password
    const loginRes = await apiRequest(app, "/api/auth/login", {
      method: "POST",
      body: { email: "reset@test.local", password: "newpass123" },
    });
    expect(loginRes.status).toBe(200);
  });

  it("T070: reset-password with invalid token fails", async () => {
    const res = await apiRequest(app, "/api/auth/reset-password", {
      method: "POST",
      body: { token: "invalid-token", password: "newpass123" },
    });

    expect(res.status).toBe(400);
  });

  it("T070b: reset-password with expired token fails", async () => {
    const userId = await createUser("expired@test.local", "oldpass123");
    const token = await generateResetToken(userId);

    // Manually expire the token in the DB
    const { db, schema } = await import("@sigilpanel/db");
    const { eq } = await import("drizzle-orm");
    await db
      .update(schema.passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 60000) })
      .where(
        eq(
          schema.passwordResetTokens.tokenHash,
          require("node:crypto").createHash("sha256").update(token).digest("hex"),
        ),
      );

    const res = await apiRequest(app, "/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "newpass123" },
    });

    expect(res.status).toBe(400);
  });

  it("T071: password reset revokes all sessions", async () => {
    const userId = await createUser("session@test.local", "oldpass123");
    const { cookie } = await loginAndGetCookie(app, "session@test.local", "oldpass123");

    // Verify session works
    const meRes = await apiRequest(app, "/api/auth/me", { cookie });
    expect(meRes.status).toBe(200);

    // Reset password
    const token = await generateResetToken(userId);
    await apiRequest(app, "/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "newpass123" },
    });

    // Old session should no longer work
    const meRes2 = await apiRequest(app, "/api/auth/me", { cookie });
    expect(meRes2.status).toBe(401);
  });
});

describe("auth routes [US4: 2FA]", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("T085: 2FA enrollment flow", async () => {
    await createAdmin("2fa-admin@test.local", "admin12345");
    const { cookie } = await loginAndGetCookie(app, "2fa-admin@test.local", "admin12345");

    // Enable 2FA
    const enableRes = await apiRequest(app, "/api/auth/2fa/enable", { method: "POST", cookie });
    expect(enableRes.status).toBe(200);
    const enableBody = await parseJson(enableRes);
    expect(enableBody.secret).toBeTruthy();
    expect(enableBody.qrUri).toBeTruthy();
    expect(enableBody.recoveryCodes).toHaveLength(8);

    // Verify with a valid TOTP code
    const code = generateTotpCode(enableBody.secret);
    const verifyRes = await apiRequest(app, "/api/auth/2fa/verify", {
      method: "POST",
      cookie,
      body: { code },
    });
    expect(verifyRes.status).toBe(200);

    // /me should show totpEnabled = true
    const meRes = await apiRequest(app, "/api/auth/me", { cookie });
    const meBody = await parseJson(meRes);
    expect(meBody.user.totpEnabled).toBe(true);
  });

  it("T086: 2FA login flow requires TOTP code", async () => {
    const userId = await createAdmin("2fa-login@test.local", "admin12345");
    const { cookie } = await loginAndGetCookie(app, "2fa-login@test.local", "admin12345");

    // Enable 2FA
    const enableRes = await apiRequest(app, "/api/auth/2fa/enable", { method: "POST", cookie });
    const { secret } = await parseJson(enableRes);
    const code = generateTotpCode(secret);
    await apiRequest(app, "/api/auth/2fa/verify", { method: "POST", cookie, body: { code } });

    // Logout
    await apiRequest(app, "/api/auth/logout", { method: "POST", cookie });

    // Login should return 2fa_required
    const loginRes = await apiRequest(app, "/api/auth/login", {
      method: "POST",
      body: { email: "2fa-login@test.local", password: "admin12345" },
    });
    expect(loginRes.status).toBe(200);
    const loginBody = await parseJson(loginRes);
    expect(loginBody.status).toBe("2fa_required");
    expect(loginBody.userId).toBe(userId);

    // Complete 2FA login with valid code
    const code2 = generateTotpCode(secret);
    const res2fa = await apiRequest(app, "/api/auth/login/2fa", {
      method: "POST",
      body: { userId, code: code2 },
    });
    expect(res2fa.status).toBe(200);
    const body2fa: any = await parseJson(res2fa);
    expect(body2fa.status).toBe("ok");
    expect(body2fa.user.email).toBe("2fa-login@test.local");
  });

  it("T087: recovery code login", async () => {
    const userId = await createAdmin("2fa-recovery@test.local", "admin12345");
    const { cookie } = await loginAndGetCookie(app, "2fa-recovery@test.local", "admin12345");

    // Enable 2FA
    const enableRes = await apiRequest(app, "/api/auth/2fa/enable", { method: "POST", cookie });
    const { secret, recoveryCodes } = await parseJson(enableRes);
    const code = generateTotpCode(secret);
    await apiRequest(app, "/api/auth/2fa/verify", { method: "POST", cookie, body: { code } });

    // Logout
    await apiRequest(app, "/api/auth/logout", { method: "POST", cookie });

    // Login with recovery code
    const loginRes = await apiRequest(app, "/api/auth/login", {
      method: "POST",
      body: { email: "2fa-recovery@test.local", password: "admin12345" },
    });
    const loginBody = await parseJson(loginRes);
    expect(loginBody.status).toBe("2fa_required");

    // Use a recovery code
    const recoveryRes = await apiRequest(app, "/api/auth/login/2fa", {
      method: "POST",
      body: { userId, code: recoveryCodes[0] },
    });
    expect(recoveryRes.status).toBe(200);
    const recoveryBody = await parseJson(recoveryRes);
    expect(recoveryBody.status).toBe("ok");

    // Try to reuse the same recovery code (should fail)
    await apiRequest(app, "/api/auth/logout", {
      method: "POST",
      cookie: extractCookie(recoveryRes),
    });
    const loginRes2 = await apiRequest(app, "/api/auth/login", {
      method: "POST",
      body: { email: "2fa-recovery@test.local", password: "admin12345" },
    });
    const reuseRes = await apiRequest(app, "/api/auth/login/2fa", {
      method: "POST",
      body: { userId, code: recoveryCodes[0] },
    });
    expect(reuseRes.status).toBe(401);
  });

  it("T088: 2FA disable with password", async () => {
    await createAdmin("2fa-disable@test.local", "admin12345");
    const { cookie } = await loginAndGetCookie(app, "2fa-disable@test.local", "admin12345");

    // Enable 2FA
    const enableRes = await apiRequest(app, "/api/auth/2fa/enable", { method: "POST", cookie });
    const { secret } = await parseJson(enableRes);
    const code = generateTotpCode(secret);
    await apiRequest(app, "/api/auth/2fa/verify", { method: "POST", cookie, body: { code } });

    // Disable 2FA with wrong password (should fail)
    const wrongRes = await apiRequest(app, "/api/auth/2fa/disable", {
      method: "POST",
      cookie,
      body: { password: "wrongpassword" },
    });
    expect(wrongRes.status).toBe(400);

    // Disable 2FA with correct password
    const disableRes = await apiRequest(app, "/api/auth/2fa/disable", {
      method: "POST",
      cookie,
      body: { password: "admin12345" },
    });
    expect(disableRes.status).toBe(200);

    // /me should show totpEnabled = false
    const meRes = await apiRequest(app, "/api/auth/me", { cookie });
    const meBody = await parseJson(meRes);
    expect(meBody.user.totpEnabled).toBe(false);
  });
});
