import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

test.describe("R6 US1: Daemon registration and heartbeat", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@sigilpanel.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
  });

  test("daemon registers with pairing token and node appears online", async ({ page, request }) => {
    // Navigate to nodes page
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    // Create region
    const regionName = `E2E-R6-US1-${Date.now()}`;
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
    expect(token).toMatch(/^sigilpair_/);
    await page.click("button:has-text('Close')");

    // Register daemon via API
    const regRes = await request.post("http://localhost:3000/api/node/register", {
      data: {
        pairingToken: token,
        hostname: "e2e-r6-daemon.test.local",
        ipAddress: "203.0.113.99",
        capabilities: { docker: true },
      },
    });
    expect(regRes.status()).toBe(201);
    const regBody = await regRes.json();
    expect(regBody.nodeId).toBeDefined();
    expect(regBody.secretId).toBeDefined();
    expect(regBody.secret).toBeDefined();

    // Wait for node to appear
    await page.waitForTimeout(2000);
    await expect(page.locator("text=e2e-r6-daemon.test.local")).toBeVisible({ timeout: 5000 });
  });
});
