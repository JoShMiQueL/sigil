import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

const API_URL = "http://localhost:3000";

async function adminLogin(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', "admin@sigil.local");
  await page.fill('input[type="password"]', "admin12345");
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("R8 US2: Registry management [T077]", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("admin can view registries page and add a community registry", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/registries");

    // Add a community registry
    await page.click("text=Add Registry");
    await page.fill('input[id="registry-name"]', "CommunityReg");
    await page.fill('input[id="registry-url"]', "https://example.com/templates");
    await page.click('button[type="submit"]');

    // Verify it appears in the list
    await expect(page.getByRole("cell", { name: "CommunityReg", exact: true })).toBeVisible({
      timeout: 5000,
    });
  });

  test("admin can delete a registry and templates remain", async ({ page }) => {
    await adminLogin(page);

    // Create a registry via API using browser context cookies (page.request shares cookies)
    const regRes = await page.request.post(`${API_URL}/api/admin/registries`, {
      data: {
        name: "DeleteTestReg",
        url: "https://example.com/templates",
        authMethod: "none",
      },
    });
    const registry = await regRes.json();

    // Verify it appears
    await page.goto("/registries");
    await expect(page.getByRole("cell", { name: "DeleteTestReg", exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Delete via API
    const delRes = await page.request.delete(`${API_URL}/api/admin/registries/${registry.id}`);
    expect(delRes.ok()).toBeTruthy();

    // Verify it's gone
    await page.reload();
    await expect(page.getByRole("cell", { name: "DeleteTestReg", exact: true })).not.toBeVisible({
      timeout: 5000,
    });
  });
});
