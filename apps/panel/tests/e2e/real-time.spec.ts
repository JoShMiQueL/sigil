import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

const API_URL = "http://localhost:3000";

test.describe("R17: Real-time panel updates", () => {
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

  test("region appears without page reload via SSE", async ({ page }) => {
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    // Create a region via API using browser cookies
    const regionName = `SSE-Region-${Date.now()}`;
    await page.request.post(`${API_URL}/api/admin/regions`, {
      data: { name: regionName, description: "Created via API" },
    });

    // Verify region appears without page reload (within 5s)
    await expect(page.locator(`text=${regionName}`)).toBeVisible({ timeout: 5000 });
  });

  test("node appears without page reload via SSE", async ({ page }) => {
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    // Create region via API using browser cookies
    const regionName = `SSE-Node-${Date.now()}`;
    const regionRes = await page.request.post(`${API_URL}/api/admin/regions`, {
      data: { name: regionName, description: "Test region" },
    });
    const region = await regionRes.json();
    await expect(page.locator(`text=${regionName}`)).toBeVisible({ timeout: 5000 });

    // Generate pairing token
    const tokenRes = await page.request.post(`${API_URL}/api/admin/pairing/tokens`, {
      data: { regionId: region.id },
    });
    const { token } = await tokenRes.json();

    // Register node via API (no auth needed for pairing)
    const hostname = `sse-test-${Date.now()}.local`;
    await page.request.post(`${API_URL}/api/node/register`, {
      data: {
        pairingToken: token,
        hostname,
        ipAddress: "10.0.0.99",
        capabilities: { docker: true, sftp: true },
      },
    });

    // Verify node appears without page reload
    await expect(page.locator(`text=${hostname}`)).toBeVisible({ timeout: 5000 });
  });

  test("node status updates to online via SSE after heartbeat", async ({ page }) => {
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    // Setup: create region + register node
    const regionName = `SSE-HB-${Date.now()}`;
    const regionRes = await page.request.post(`${API_URL}/api/admin/regions`, {
      data: { name: regionName, description: "Test" },
    });
    const region = await regionRes.json();
    await expect(page.locator(`text=${regionName}`)).toBeVisible({ timeout: 5000 });

    const tokenRes = await page.request.post(`${API_URL}/api/admin/pairing/tokens`, {
      data: { regionId: region.id },
    });
    const { token } = await tokenRes.json();

    const hostname = `sse-hb-${Date.now()}.local`;
    const nodeRes = await page.request.post(`${API_URL}/api/node/register`, {
      data: {
        pairingToken: token,
        hostname,
        ipAddress: "10.0.0.98",
        capabilities: { docker: true },
      },
    });
    const { secretId, secret } = await nodeRes.json();
    await expect(page.locator(`text=${hostname}`)).toBeVisible({ timeout: 5000 });

    // Verify initial status is "unknown"
    await expect(page.locator(`tr:has-text("${hostname}")`)).toContainText("unknown");

    // Send heartbeat with HMAC signature
    const ts = Math.floor(Date.now() / 1000);
    const heartbeatBody = JSON.stringify({
      timestamp: ts,
      cpuUsage: 42.5,
      memoryUsage: 55.0,
      diskUsage: 25.0,
      containerCount: 2,
    });
    const crypto = await import("node:crypto");
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${ts}${heartbeatBody}`)
      .digest("hex");

    await page.request.post(`${API_URL}/api/node/heartbeat`, {
      headers: {
        "x-node-id": secretId,
        "x-node-signature": signature,
        "x-node-timestamp": String(ts),
        "Content-Type": "application/json",
      },
      data: {
        timestamp: ts,
        cpuUsage: 42.5,
        memoryUsage: 55.0,
        diskUsage: 25.0,
        containerCount: 2,
      },
    });

    // Verify status changes to "online" without page reload
    await expect(page.locator(`tr:has-text("${hostname}")`)).toContainText("online", {
      timeout: 5000,
    });
  });

  test("no polling requests for node data", async ({ page }) => {
    await page.click("button:has-text('Nodes')");
    await page.waitForURL("/nodes");

    // Wait for initial load + SSE connection
    await page.waitForTimeout(3000);

    // Monitor network requests for 5 seconds
    const requests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      // Exclude the SSE endpoint itself
      if (
        (url.includes("/api/admin/nodes") || url.includes("/api/admin/regions")) &&
        !url.includes("/sse")
      ) {
        requests.push(url);
      }
    });

    await page.waitForTimeout(5000);

    // Should have no polling requests. SSE-triggered refetches (from daemon
    // heartbeats) are acceptable — they're event-driven, not timer-based.
    // The E2E daemon sends heartbeats every 5s, so allow up to 2 refetches.
    expect(requests.length).toBeLessThanOrEqual(2);
  });
});
