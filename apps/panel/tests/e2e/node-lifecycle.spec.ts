import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

test.describe("US4: Node lifecycle management [T053b]", () => {
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

  test("admin can edit, regenerate credentials, and delete a node", async ({ page, request }) => {
    // Setup: create region + register node via API
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    const regionName = `E2E-Lifecycle-${Date.now()}`;
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

    // Register daemon
    const regRes = await request.post("http://localhost:3000/api/node/register", {
      data: {
        pairingToken: token,
        hostname: "e2e-lifecycle.test.local",
        ipAddress: "203.0.113.77",
        capabilities: { docker: true },
      },
    });
    expect(regRes.status()).toBe(201);

    // Wait for node to appear and click it
    await page.waitForTimeout(2000);
    await page.click("text=e2e-lifecycle.test.local");
    await page.waitForURL(/\/nodes\/[^/]+$/);

    // Edit display name
    await page.click("button:has-text('Edit Node')");
    const nameInput = page.locator("input[type='text']").first();
    await nameInput.fill("My Renamed Node");
    await page.click("button:has-text('Save')");
    await expect(page.locator("text=Node updated")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("h1:has-text('My Renamed Node')")).toBeVisible({ timeout: 5000 });

    // Regenerate credentials
    await page.click("button:has-text('Regenerate Credentials')");
    await expect(page.locator("text=Credentials regenerated")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("textarea[readonly]")).toBeVisible({ timeout: 5000 });

    // Dismiss the credentials dialog
    await page.click("button:has-text('Dismiss')");

    // Delete the node
    page.on("dialog", (dialog) => dialog.accept());
    await page.click("button:has-text('Delete Node')");
    await page.waitForURL("/nodes", { timeout: 5000 });

    // Node should be gone
    await expect(page.locator("h1")).not.toHaveText("My Renamed Node", { timeout: 5000 });
    await expect(page.locator("tr:has-text('My Renamed Node')")).not.toBeVisible({ timeout: 5000 });
  });
});
