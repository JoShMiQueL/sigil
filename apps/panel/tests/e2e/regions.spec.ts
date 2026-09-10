import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

test.describe("US1: Region management [T026]", () => {
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

  test("admin can create a region via panel", async ({ page }) => {
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    const regionName = `E2E-Region-${Date.now()}`;
    await page.fill('form:has(h3:has-text("Create Region")) input', regionName);
    await page.click('form:has(h3:has-text("Create Region")) button[type="submit"]');

    await expect(page.locator(`text=${regionName}`)).toBeVisible({ timeout: 5000 });
  });

  test("admin can delete a region with no nodes", async ({ page }) => {
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    // Create a region
    const regionName = `E2E-Delete-${Date.now()}`;
    await page.fill('form:has(h3:has-text("Create Region")) input', regionName);
    await page.click('form:has(h3:has-text("Create Region")) button[type="submit"]');
    await expect(page.locator(`text=${regionName}`)).toBeVisible({ timeout: 5000 });

    // Delete it
    const regionRow = page.locator(`tr:has-text("${regionName}")`);
    await regionRow.locator("button:has-text('Delete')").click();
    await page.waitForTimeout(1000);

    await expect(page.locator(`text=${regionName}`)).not.toBeVisible({ timeout: 5000 });
  });

  test("duplicate region name shows error", async ({ page }) => {
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    const regionName = `E2E-Dup-${Date.now()}`;
    await page.fill('form:has(h3:has-text("Create Region")) input', regionName);
    await page.click('form:has(h3:has-text("Create Region")) button[type="submit"]');
    await expect(page.locator(`text=${regionName}`)).toBeVisible({ timeout: 5000 });

    // Try to create another with the same name
    await page.fill('form:has(h3:has-text("Create Region")) input', regionName);
    await page.click('form:has(h3:has-text("Create Region")) button[type="submit"]');

    await expect(page.locator("text=A region with this name already exists")).toBeVisible({
      timeout: 5000,
    });
  });
});
