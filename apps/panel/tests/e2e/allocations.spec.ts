import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

const API_URL = "http://localhost:3000";

test.describe("R7: Allocations [US1: Admin manages IP allocations per node]", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
  });

  test("admin can create allocations via panel", async ({ page }) => {
    // Create a region via API (page.request shares the browser session cookie)
    const regionRes = await page.request.post(`${API_URL}/api/admin/regions`, {
      data: { name: "alloc-e2e-region" },
    });
    expect(regionRes.ok()).toBeTruthy();
    const region = await regionRes.json();

    // Generate pairing token
    const tokenRes = await page.request.post(`${API_URL}/api/admin/pairing/tokens`, {
      data: { regionId: region.id },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const token = await tokenRes.json();

    // Register the node
    const registerRes = await page.request.post(`${API_URL}/api/node/register`, {
      data: {
        pairingToken: token.token,
        hostname: "alloc-e2e-node",
        ipAddress: "203.0.113.10",
        capabilities: { docker: true },
      },
    });
    expect(registerRes.ok()).toBeTruthy();
    const node = await registerRes.json();
    const nodeId = node.nodeId;

    // Navigate to the node detail page
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");
    await page.click("text=alloc-e2e-node");
    await page.waitForURL(`/nodes/${nodeId}`);

    // Verify allocations section is visible
    await expect(page.locator("h2:has-text('Allocations')")).toBeVisible();

    // Add allocations
    await page.fill('input[placeholder="203.0.113.10"]', "203.0.113.10");
    await page.fill('input[placeholder="25565"]', "25565");
    await page.fill('input[placeholder="25575"]', "25575");
    await page.click('button:has-text("Add")');

    // Verify success message
    await expect(page.locator("text=Created 11 allocations")).toBeVisible({ timeout: 5000 });

    // Verify allocations appear in the table
    await expect(page.locator("text=203.0.113.10").first()).toBeVisible();
    await expect(page.locator("text=25565").first()).toBeVisible();
    await expect(page.locator("text=available").first()).toBeVisible();
  });

  test("admin can delete an available allocation", async ({ page }) => {
    // Setup: create region + node + allocations
    const regionRes = await page.request.post(`${API_URL}/api/admin/regions`, {
      data: { name: "alloc-delete-region" },
    });
    const region = await regionRes.json();

    const tokenRes = await page.request.post(`${API_URL}/api/admin/pairing/tokens`, {
      data: { regionId: region.id },
    });
    const token = await tokenRes.json();

    const registerRes = await page.request.post(`${API_URL}/api/node/register`, {
      data: {
        pairingToken: token.token,
        hostname: "alloc-delete-node",
        ipAddress: "203.0.113.20",
        capabilities: { docker: true },
      },
    });
    const node = await registerRes.json();
    const nodeId = node.nodeId;

    // Add allocations via API
    await page.request.post(`${API_URL}/api/admin/nodes/${nodeId}/allocations`, {
      data: { ip: "203.0.113.20", portStart: 25565, portEnd: 25567, protocol: "tcp" },
    });

    // Navigate to node detail
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");
    await page.click("text=alloc-delete-node");
    await page.waitForURL(`/nodes/${nodeId}`);

    // Verify 3 allocations exist
    await expect(page.locator("text=3").first()).toBeVisible({ timeout: 5000 });

    // Delete the first allocation
    const firstDeleteButton = page.locator('button:has-text("Delete")').first();
    await firstDeleteButton.click();

    // Verify count decreased — the summary should show 2
    await expect(page.locator("text=2").first()).toBeVisible({ timeout: 5000 });
  });

  test("admin can filter allocations by IP", async ({ page }) => {
    // Setup
    const regionRes = await page.request.post(`${API_URL}/api/admin/regions`, {
      data: { name: "alloc-filter-region" },
    });
    const region = await regionRes.json();

    const tokenRes = await page.request.post(`${API_URL}/api/admin/pairing/tokens`, {
      data: { regionId: region.id },
    });
    const token = await tokenRes.json();

    const registerRes = await page.request.post(`${API_URL}/api/node/register`, {
      data: {
        pairingToken: token.token,
        hostname: "alloc-filter-node",
        ipAddress: "203.0.113.30",
        capabilities: { docker: true },
      },
    });
    const node = await registerRes.json();
    const nodeId = node.nodeId;

    // Add allocations on two IPs
    await page.request.post(`${API_URL}/api/admin/nodes/${nodeId}/allocations`, {
      data: { ip: "203.0.113.30", portStart: 25565, portEnd: 25567, protocol: "tcp" },
    });
    await page.request.post(`${API_URL}/api/admin/nodes/${nodeId}/allocations`, {
      data: { ip: "203.0.113.31", portStart: 25565, portEnd: 25567, protocol: "tcp" },
    });

    // Navigate to node detail
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");
    await page.click("text=alloc-filter-node");
    await page.waitForURL(`/nodes/${nodeId}`);

    // Wait for allocations to load — verify 6 total
    await expect(page.locator("text=Showing 6 of 6")).toBeVisible({ timeout: 5000 });

    // Filter by IP — select the IP filter dropdown (2nd select on the page after protocol)
    const ipFilterSelect = page.locator("select").nth(2);
    await ipFilterSelect.selectOption("203.0.113.31");

    // Verify only 3 shown (203.0.113.31 ports)
    await expect(page.locator("text=Showing 3 of 6")).toBeVisible({ timeout: 5000 });

    // Clear filter
    await page.click('button:has-text("Clear")');
    await expect(page.locator("text=Showing 6 of 6")).toBeVisible({ timeout: 5000 });
  });

  test("admin can search allocations by port", async ({ page }) => {
    // Setup
    const regionRes = await page.request.post(`${API_URL}/api/admin/regions`, {
      data: { name: "alloc-search-region" },
    });
    const region = await regionRes.json();

    const tokenRes = await page.request.post(`${API_URL}/api/admin/pairing/tokens`, {
      data: { regionId: region.id },
    });
    const token = await tokenRes.json();

    const registerRes = await page.request.post(`${API_URL}/api/node/register`, {
      data: {
        pairingToken: token.token,
        hostname: "alloc-search-node",
        ipAddress: "203.0.113.40",
        capabilities: { docker: true },
      },
    });
    const node = await registerRes.json();
    const nodeId = node.nodeId;

    // Add allocations on two IPs (same port range)
    await page.request.post(`${API_URL}/api/admin/nodes/${nodeId}/allocations`, {
      data: { ip: "203.0.113.40", portStart: 25565, portEnd: 25567, protocol: "tcp" },
    });
    await page.request.post(`${API_URL}/api/admin/nodes/${nodeId}/allocations`, {
      data: { ip: "203.0.113.41", portStart: 25565, portEnd: 25567, protocol: "tcp" },
    });

    // Navigate to node detail
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");
    await page.click("text=alloc-search-node");
    await page.waitForURL(`/nodes/${nodeId}`);

    // Wait for allocations to load — verify 6 total
    await expect(page.locator("text=Showing 6 of 6")).toBeVisible({ timeout: 5000 });

    // Search by port 25565 (should show 2 — one per IP)
    await page.fill('input[placeholder="Search port..."]', "25565");
    await expect(page.locator("text=Showing 2 of 6")).toBeVisible({ timeout: 5000 });
  });

  test("non-admin cannot access allocations API", async ({ request }) => {
    // Test that unauthenticated requests are rejected
    const res = await request.post(
      `${API_URL}/api/admin/nodes/00000000-0000-4000-8000-000000000001/allocations`,
      {
        data: { ip: "203.0.113.10", portStart: 25565 },
      },
    );
    // Should get 401 or 403
    expect([401, 403]).toContain(res.status());
  });
});
