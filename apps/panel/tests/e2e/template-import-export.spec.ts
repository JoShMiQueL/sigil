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

test.describe("R8 US5/US6: Template import/export [T076]", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("admin can import a PTDL_v2 egg and export a template", async ({ page }) => {
    await adminLogin(page);

    // Create a group via API using browser context cookies (page.request shares cookies)
    const groupRes = await page.request.post(`${API_URL}/api/admin/groups`, {
      data: { name: "ImportTest" },
    });
    const group = await groupRes.json();

    // Create a test PTDL_v2 egg file
    const eggJson = JSON.stringify({
      meta: { version: "PTDL_v2" },
      name: "E2E Test Egg",
      author: "E2E",
      description: "Test egg for E2E",
      docker_images: { java: "eclipse-temurin:21-jre" },
      startup: "java -jar test.jar",
      config: { stop: "^C" },
      variables: [
        {
          name: "Max Players",
          env_variable: "MAX_PLAYERS",
          default_value: "20",
          rules: "required|integer|min:1|max:100",
          field_type: "number",
          user_viewable: true,
          user_editable: true,
        },
      ],
      scripts: {
        installation: {
          script: "echo install",
          container: "eclipse-temurin:21-jre",
          entrypoint: "bash",
        },
      },
    });

    // Import via API using multipart form data
    const importRes = await page.request.post(`${API_URL}/api/admin/templates/import`, {
      multipart: {
        file: {
          name: "test-egg.json",
          mimeType: "application/json",
          buffer: Buffer.from(eggJson),
        },
        groupId: group.id,
        conflict: "skip",
      },
    });
    const importResult = await importRes.json();

    expect(importResult.templateId).toBeDefined();
    expect(importResult.skippedFields).toContain("scripts");
    expect(importResult.conflict).toBe("created");

    // Verify the template appears in the panel
    await page.goto("/templates");
    await expect(page.getByRole("cell", { name: "E2E Test Egg", exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Export the template via API
    const exportRes = await page.request.get(
      `${API_URL}/api/admin/templates/${importResult.templateId}/export`,
    );
    expect(exportRes.ok()).toBeTruthy();
    expect(exportRes.headers()["content-type"]).toContain("yaml");
    const yaml = await exportRes.text();
    expect(yaml).toContain("E2E Test Egg");
    expect(yaml).toContain("java -jar test.jar");
    expect(yaml).toContain("MAX_PLAYERS");
  });
});
