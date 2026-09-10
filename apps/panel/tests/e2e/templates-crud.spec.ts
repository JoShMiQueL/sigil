import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

async function adminLogin(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', "admin@sigilpanel.local");
  await page.fill('input[type="password"]', "admin12345");
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("R8 US3: Template lifecycle [T075]", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("admin can create a template with tags, activate, deactivate, and delete", async ({
    page,
  }) => {
    await adminLogin(page);

    // Create template — fill all required fields including tags
    await page.goto("/templates");
    await page.waitForSelector("text=Create Template");
    await page.click("text=Create Template");
    await page.fill('input[id="tpl-name"]', "TestServer");
    await page.fill('input[id="tpl-tags"]', "minecraft, java, test");
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

    // Verify tags are displayed
    await expect(page.getByRole("cell", { name: "minecraft, java, test" })).toBeVisible({
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

  test("admin can filter templates by tag", async ({ page }) => {
    await adminLogin(page);

    // Create two templates with different tags via API (page.request shares cookies)
    await page.request.post("http://localhost:3000/api/admin/templates", {
      data: {
        name: "Paper MC",
        tags: ["minecraft", "java"],
        image: "eclipse-temurin:21-jre",
        startupCommand: "java -jar paper.jar",
        resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
      },
    });
    await page.request.post("http://localhost:3000/api/admin/templates", {
      data: {
        name: "Rust Server",
        tags: ["rust", "steamcmd"],
        image: "rust:latest",
        startupCommand: "./RustDedServer",
        resourceLimits: { memoryMb: 2048, cpuLimit: 2.0, pidsLimit: 512 },
      },
    });

    await page.goto("/templates");
    await page.waitForSelector("text=Create Template");

    // Filter by minecraft tag
    await page.selectOption("#tag-filter", "minecraft");
    await expect(page.getByRole("cell", { name: "Paper MC", exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("cell", { name: "Rust Server", exact: true })).not.toBeVisible({
      timeout: 5000,
    });
  });
});
