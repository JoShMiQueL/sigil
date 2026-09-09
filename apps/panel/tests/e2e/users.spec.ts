import { expect, test } from "@playwright/test";

test.describe("US2: User creation flow [T053]", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@sigilpanel.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
  });

  test("admin can create a user via panel", async ({ page }) => {
    await page.click("button:has-text('Users')");
    await page.waitForURL("/users");

    // Fill create user form
    const uniqueEmail = `e2e-${Date.now()}@test.local`;
    await page.fill('form:has(h2:has-text("Create User")) input[type="email"]', uniqueEmail);
    await page.fill(
      'form:has(h2:has-text("Create User")) input[type="text"]',
      `e2euser${Date.now()}`,
    );
    await page.fill('form:has(h2:has-text("Create User")) input[type="password"]', "e2epass123");
    await page.click('form:has(h2:has-text("Create User")) button[type="submit"]');

    // User should appear in the table
    await expect(page.locator("text=" + uniqueEmail)).toBeVisible({ timeout: 5000 });
  });

  test("admin can suspend a user", async ({ page }) => {
    await page.click("button:has-text('Users')");
    await page.waitForURL("/users");

    // Find a suspend button and click it
    const suspendButton = page.locator("button:has-text('Suspend')").first();
    if (await suspendButton.isVisible()) {
      await suspendButton.click();
      // Wait for the page to update
      await page.waitForTimeout(1000);
      // The suspended user should show "suspended" status
      await expect(page.locator("text=suspended").first()).toBeVisible({ timeout: 5000 });
    }
  });
});
