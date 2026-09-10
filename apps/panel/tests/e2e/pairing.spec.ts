import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

test.describe("US2: Node pairing flow [T036]", () => {
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

  test("admin can generate a pairing token and register a node", async ({ page, request }) => {
    // Navigate to nodes page
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    // Create a region first
    const regionName = `E2E-Pair-${Date.now()}`;
    await page.fill('form:has(h3:has-text("Create Region")) input', regionName);
    await page.click('form:has(h3:has-text("Create Region")) button[type="submit"]');
    await expect(page.locator(`text=${regionName}`)).toBeVisible({ timeout: 5000 });

    // Generate pairing token
    await page.click("button:has-text('Generate Pairing Token')");
    await page.selectOption("select", { label: regionName });
    await page.click("button:has-text('Generate')");

    // Token should be displayed
    const tokenTextarea = page.locator("textarea[readonly]");
    await expect(tokenTextarea).toBeVisible({ timeout: 5000 });
    const token = await tokenTextarea.inputValue();
    expect(token).toMatch(/^sigilpair_/);

    // Close dialog
    await page.click("button:has-text('Close')");

    // Simulate daemon registration via API
    const regRes = await request.post("http://localhost:3000/api/node/register", {
      data: {
        pairingToken: token,
        hostname: "e2e-node.test.local",
        ipAddress: "203.0.113.99",
        capabilities: { docker: true, sftp: true },
      },
    });
    expect(regRes.status()).toBe(201);
    const regBody = await regRes.json();
    expect(regBody.nodeId).toBeDefined();
    expect(regBody.secret).toMatch(/^sigilnode_/);

    // Node should appear in the table after refresh
    await page.waitForTimeout(2000); // Wait for refetch interval
    await expect(page.locator("text=e2e-node.test.local")).toBeVisible({ timeout: 10000 });
  });
});
