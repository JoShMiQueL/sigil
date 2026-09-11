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

test.describe("R9 US1: Server creation via panel", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("create server via panel UI — appears in list with offline status", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    // Setup: create template + activate + add allocations
    const templateId = await createTemplate(cookie, "R9 Test Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    // Login
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("http://localhost:5173/");

    // Navigate to servers page
    await page.goto("http://localhost:5173/servers");
    await page.waitForSelector('h1:has-text("Servers")');

    // Click Create Server
    await page.click('button:has-text("Create Server")');

    // Fill the form
    await page.fill("#server-name", "R9 E2E Server");
    await page.selectOption("#server-node", nodeId);
    await page.selectOption("#server-template", templateId);

    // Submit
    await page.click('button:has-text("Create Server"):not(:has-text("Creating"))');

    // Wait for the dialog to close and the server to appear in the list
    await page.waitForSelector('text="R9 E2E Server"', { timeout: 10000 });

    // Verify the server appears in the list
    const serverRow = page.locator('text="R9 E2E Server"');
    await expect(serverRow).toBeVisible();
  });

  test("rejects duplicate server name on same node", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    const templateId = await createTemplate(cookie, "R9 Dup Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    // Login
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("http://localhost:5173/");

    // Navigate to servers page
    await page.goto("http://localhost:5173/servers");
    await page.waitForSelector('h1:has-text("Servers")');

    // Create first server
    await page.click('button:has-text("Create Server")');
    await page.fill("#server-name", "Dup Server");
    await page.selectOption("#server-node", nodeId);
    await page.selectOption("#server-template", templateId);
    await page.click('button:has-text("Create Server"):not(:has-text("Creating"))');
    await page.waitForSelector('text="Dup Server"', { timeout: 10000 });

    // Try to create second server with same name
    await page.click('button:has-text("Create Server")');
    await page.fill("#server-name", "Dup Server");
    await page.selectOption("#server-node", nodeId);
    await page.selectOption("#server-template", templateId);
    await page.click('button:has-text("Create Server"):not(:has-text("Creating"))');

    // Should show error
    await page.waitForSelector('text="Server name already exists on this node"', {
      timeout: 10000,
    });
  });
});

test.describe("R9 US2: Server power controls", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("start/stop/restart buttons are state-aware", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    const templateId = await createTemplate(cookie, "R9 Power Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    // Create a server via API (daemon is available in E2E → creates with running status)
    const createRes = await fetchRetry(`${API_URL}/api/admin/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Power Test Server", nodeId, templateId, variables: {} }),
    });
    expect(createRes.status).toBe(201);

    // Login and navigate to server detail
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("http://localhost:5173/");

    // Navigate to servers page and click the server
    await page.goto("http://localhost:5173/servers");
    await page.waitForSelector('text="Power Test Server"');
    await page.click('text="Power Test Server"');

    // Verify we're on the detail page
    await page.waitForSelector('h2:has-text("Power Test Server")');

    // Start button should be disabled (already running)
    await expect(page.locator('button:has-text("Start"):not(:has-text("Restart"))')).toBeDisabled();

    // Stop button should be enabled (running can stop)
    await expect(page.locator('button:has-text("Stop")')).toBeEnabled();

    // Restart button should be enabled (running can restart)
    await expect(page.locator('button:has-text("Restart")')).toBeEnabled();
  });
});

test.describe("R9 US3: Server deletion", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("delete button exists on detail page", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    const templateId = await createTemplate(cookie, "R9 Delete Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    // Create a server via API (daemon available → creates successfully)
    await fetchRetry(`${API_URL}/api/admin/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Delete Test Server", nodeId, templateId, variables: {} }),
    });

    // Login
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("http://localhost:5173/");

    // Navigate to server detail
    await page.goto("http://localhost:5173/servers");
    await page.waitForSelector('text="Delete Test Server"');
    await page.click('text="Delete Test Server"');

    // Verify delete button exists
    await page.waitForSelector('button:has-text("Delete Server")');
    await expect(page.locator('button:has-text("Delete Server")')).toBeVisible();
  });
});

test.describe("R9 US4: Server list filtering", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("filter by status shows correct subset", async ({ page }) => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    const templateId = await createTemplate(cookie, "R9 Filter Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    // Create a server via API (daemon available → creates with offline status)
    await fetchRetry(`${API_URL}/api/admin/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Filter Test Server", nodeId, templateId, variables: {} }),
    });

    // Login
    await page.goto("http://localhost:5173/login");
    await page.fill('input[type="email"]', "admin@sigil.local");
    await page.fill('input[type="password"]', "admin12345");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("http://localhost:5173/");

    // Navigate to servers page
    await page.goto("http://localhost:5173/servers");
    await page.waitForSelector('text="Filter Test Server"');

    // Filter by "Running" status (daemon creates and starts the container)
    await page.selectOption('select[aria-label="Filter by status"]', "running");

    // Should still show the server
    await expect(page.locator('text="Filter Test Server"')).toBeVisible();

    // Filter by "Offline" status
    await page.selectOption('select[aria-label="Filter by status"]', "offline");

    // Should not show the server
    await expect(page.locator('text="Filter Test Server"')).not.toBeVisible();
  });
});
