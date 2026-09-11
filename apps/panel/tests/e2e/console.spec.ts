import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

const API_URL = "http://localhost:3000";

function getNodeId(): string {
  const nodeId = process.env.E2E_NODE_ID;
  if (!nodeId) {
    throw new Error("E2E_NODE_ID env var not set — run via scripts/run-e2e.ts");
  }
  return nodeId;
}

async function fetchRetry(url: string, init?: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("unreachable");
}

async function getAdminCookie(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@sigil.local", password: "admin12345" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

async function createTemplate(cookie: string, name: string): Promise<string> {
  const res = await fetchRetry(`${API_URL}/api/admin/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name,
      tags: [],
      image: "alpine:latest",
      startupCommand: "sleep infinity",
      resourceLimits: { memoryMb: 64, cpuLimit: 0.5, pidsLimit: 128 },
    }),
  });
  const body = await res.json();
  return body.id;
}

async function activateTemplate(cookie: string, templateId: string): Promise<void> {
  await fetchRetry(`${API_URL}/api/admin/templates/${templateId}/activate`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
}

async function addAllocations(cookie: string, nodeId: string): Promise<void> {
  await fetchRetry(`${API_URL}/api/admin/nodes/${nodeId}/allocations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ ip: "203.0.113.10", portStart: 25565, portEnd: 25575, protocol: "tcp" }),
  });
}

async function createServer(
  cookie: string,
  name: string,
  nodeId: string,
  templateId: string,
): Promise<string> {
  const res = await fetchRetry(`${API_URL}/api/admin/servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, nodeId, templateId, variables: {} }),
  });
  const body = await res.json();
  return body.id;
}

test.describe("R10 US1: Console viewing", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("console appears for running server", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();
    const templateId = await createTemplate(cookie, "R10 Console Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R10 Console Test", nodeId, templateId);

    // Login and navigate to server detail
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("http://localhost:5173/");

    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Verify console section is visible
    await expect(page.locator("h3").filter({ hasText: "Console" })).toBeVisible({ timeout: 10000 });

    // Verify connection state indicator is visible
    // Server should be running (daemon creates and starts container)
    const stateText = await page.locator("pre").textContent();
    expect(stateText).toBeTruthy();
  });

  test("console shows not running for stopped server", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();
    const templateId = await createTemplate(cookie, "R10 Stopped Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    // Create a server but don't start it (use a name that will fail to connect to daemon)
    // Actually in E2E the daemon is available, so the server will be running.
    // Instead, let's stop the server after creating it.
    const serverId = await createServer(cookie, "R10 Stopped Test", nodeId, templateId);

    // Stop the server
    await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/power`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ action: "stop" }),
    });

    // Wait for server to stop
    await new Promise((r) => setTimeout(r, 2000));

    // Login and navigate
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("http://localhost:5173/");

    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Verify console shows "Server is not running"
    await expect(page.locator("pre")).toContainText("not running", { timeout: 10000 });

    // Verify console input is disabled
    const input = page.locator('input[placeholder*="disabled"]');
    await expect(input).toBeDisabled();
  });

  test("console input is disabled when server is stopped", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();
    const templateId = await createTemplate(cookie, "R10 Input Disabled Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R10 Input Test", nodeId, templateId);

    // Stop the server
    await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/power`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ action: "stop" }),
    });

    await new Promise((r) => setTimeout(r, 2000));

    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("http://localhost:5173/");

    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Console input should be disabled
    const input = page.locator('input[placeholder*="disabled"]');
    await expect(input).toBeDisabled({ timeout: 10000 });

    // Send button should be disabled
    const sendButton = page.locator('button:has-text("Send")');
    await expect(sendButton).toBeDisabled();
  });
});

test.describe("R10 US3: Resource stats", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("stats panel is visible on server detail page", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();
    const templateId = await createTemplate(cookie, "R10 Stats Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R10 Stats Test", nodeId, templateId);

    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("http://localhost:5173/");

    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Verify stats section is visible
    await expect(page.locator("h3").filter({ hasText: "Resource Stats" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("stats show not available for stopped server", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();
    const templateId = await createTemplate(cookie, "R10 Stats Stopped Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R10 Stats Stopped", nodeId, templateId);

    // Stop the server
    await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/power`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ action: "stop" }),
    });

    await new Promise((r) => setTimeout(r, 2000));

    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button[type="submit"]');
    await page.waitForURL("http://localhost:5173/");

    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Verify stats section shows "not available"
    await expect(page.locator("h3").filter({ hasText: "Resource Stats" })).toBeVisible({
      timeout: 10000,
    });
    const statsText = await page.locator("h3:has-text('Resource Stats') + div").textContent();
    expect(statsText).toContain("not available");
  });
});
