import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

test.describe("US1: Login flow [T034]", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("admin can login and see dashboard", async ({ page }) => {
    await page.goto("/login");

    // Fill login form
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await page.waitForURL("/");
    await expect(page.locator("h1")).toContainText("Dashboard");
    await expect(page).toHaveTitle(/SigilPanel/);
  });

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    // Should stay on login page and show error
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 });
  });

  test("can logout from dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // Click logout
    await page.click("button:has-text('Logout')");
    await page.waitForURL("/login", { timeout: 5000 });
  });
});
