import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

const API_URL = "http://localhost:3000";

async function adminLogin(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', "admin@sigilpanel.local");
  await page.fill('input[type="password"]', "admin12345");
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("R8 US1: Group CRUD [T074]", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("admin can create, edit, and delete a group", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/groups");

    // Create
    await page.click("text=Create Group");
    await page.fill('input[id="group-name"]', "TestGroup");
    await page.fill('input[id="group-description"]', "A test group");
    await page.click('button[type="submit"]');

    // Verify created — use exact match to avoid matching description
    await expect(page.getByRole("cell", { name: "TestGroup", exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Edit
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.fill('input[id="group-name"]', "EditedGroup");
    await page.click('button[type="submit"]');
    await expect(page.getByRole("cell", { name: "EditedGroup", exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Delete
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByRole("cell", { name: "EditedGroup", exact: true })).not.toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("R8 US3: Template lifecycle [T075]", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("admin can create a template, activate, deactivate, and delete", async ({ page }) => {
    await adminLogin(page);

    // Create a group via API using browser context cookies (page.request shares cookies)
    const groupRes = await page.request.post(`${API_URL}/api/admin/groups`, {
      data: { name: "LifecycleTest" },
    });
    const _group = await groupRes.json();

    // Create template — fill all required fields
    await page.goto("/templates");
    // Wait for groups to load so the form can render
    await page.waitForSelector("text=Create Template");
    await page.click("text=Create Template");
    await page.fill('input[id="tpl-name"]', "TestServer");
    await page.fill('input[id="tpl-image"]', "eclipse-temurin:21-jre");
    await page.fill('input[id="tpl-startup"]', "java -jar test.jar");
    await page.fill('input[id="tpl-mem"]', "1024");
    await page.fill('input[id="tpl-cpu"]', "1");
    await page.fill('input[id="tpl-pids"]', "512");
    await page.click('button[type="submit"]');

    // Verify created
    await expect(page.getByRole("cell", { name: "TestServer", exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Activate
    await page.getByRole("button", { name: "Activate" }).first().click();
    await expect(page.getByText("✓").first()).toBeVisible({ timeout: 5000 });

    // Deactivate
    await page.getByRole("button", { name: "Deactivate" }).first().click();

    // Delete
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByRole("cell", { name: "TestServer", exact: true })).not.toBeVisible({
      timeout: 5000,
    });
  });
});
