import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

test.describe("US3: Health monitoring [T046]", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
  });

  test("node shows online status after heartbeat", async ({ page, request }) => {
    // Navigate to nodes page and create a region
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    const regionName = `E2E-HB-${Date.now()}`;
    await page.fill('form:has(h3:has-text("Create Region")) input', regionName);
    await page.click('form:has(h3:has-text("Create Region")) button[type="submit"]');
    await expect(page.locator(`text=${regionName}`)).toBeVisible({ timeout: 5000 });

    // Generate pairing token
    await page.click("button:has-text('Generate Pairing Token')");
    await page.selectOption("select", { label: regionName });
    await page.click("button:has-text('Generate')");

    const tokenTextarea = page.locator("textarea[readonly]");
    await expect(tokenTextarea).toBeVisible({ timeout: 5000 });
    const token = await tokenTextarea.inputValue();
    await page.click("button:has-text('Close')");

    // Register a daemon
    const regRes = await request.post("http://localhost:3000/api/node/register", {
      data: {
        pairingToken: token,
        hostname: "e2e-hb.test.local",
        ipAddress: "203.0.113.50",
        capabilities: { docker: true },
      },
    });
    expect(regRes.status()).toBe(201);
    const regBody = await regRes.json();
    const { secretId, secret } = regBody;

    // Send a heartbeat with valid auth
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      timestamp: ts,
      cpuUsage: 55.0,
      memoryUsage: 70.0,
      diskUsage: 40.0,
      containerCount: 3,
    });

    // Build HMAC signature
    const enc = new TextEncoder();
    const keyData = enc.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const message = enc.encode(`${ts}${body}`);
    const sigBuf = await crypto.subtle.sign("HMAC", key, message);
    const signature = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const hbRes = await request.post("http://localhost:3000/api/node/heartbeat", {
      headers: {
        "Content-Type": "application/json",
        "x-node-id": secretId,
        "x-node-signature": signature,
        "x-node-timestamp": ts.toString(),
      },
      data: body,
    });
    expect(hbRes.status()).toBe(204);

    // Navigate to node detail page and verify online status
    await page.waitForTimeout(2000);
    await page.click("text=e2e-hb.test.local");
    await page.waitForURL(/\/nodes\/[^/]+$/);

    // Should show online status
    await expect(page.locator("text=online").first()).toBeVisible({ timeout: 10000 });
  });
});
