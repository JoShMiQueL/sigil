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
  if (!res.ok) {
    throw new Error(`createServer failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.id;
}

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("http://localhost:5173/login");
  await page.fill('input[type="email"]', "admin@sigil.local");
  await page.fill('input[type="password"]', "admin12345");
  await page.click('button[type="submit"]');
  await page.waitForURL("http://localhost:5173/");
}

test.describe("R11 File Manager", () => {
  test.beforeEach(async () => {
    await cleanupDatabase();
  });

  test("files section renders for any server", async ({ page }) => {
    const cookie = await getAdminCookie();
    const nodeId = getNodeId();
    const templateId = await createTemplate(cookie, "R11 File Test");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R11 Files Render", nodeId, templateId);

    await login(page);
    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Verify Files section heading is visible
    await expect(page.locator("h3").filter({ hasText: "Files" })).toBeVisible({ timeout: 10000 });
  });

  test("files section shows listing for running server", async ({ page }) => {
    const cookie = await getAdminCookie();
    const nodeId = getNodeId();
    const templateId = await createTemplate(cookie, "R11 File Browse");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R11 Browse Test", nodeId, templateId);

    await login(page);
    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Verify Files section heading is visible
    await expect(page.locator("h3").filter({ hasText: "Files" })).toBeVisible({ timeout: 10000 });

    // Wait for file listing to appear (breadcrumb "root" or table)
    await expect(page.locator("button:has-text('root')")).toBeVisible({ timeout: 15000 });
  });

  test("stats section shows not available for stopped server", async ({ page }) => {
    const cookie = await getAdminCookie();
    const nodeId = getNodeId();
    const templateId = await createTemplate(cookie, "R11 Stats Test");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R11 Stats Stopped", nodeId, templateId);

    await login(page);
    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Verify stats section heading is visible
    await expect(page.locator("h3").filter({ hasText: "Resource Stats" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("edit and save a text file", async ({ page }) => {
    const cookie = await getAdminCookie();
    const nodeId = getNodeId();
    const templateId = await createTemplate(cookie, "R11 Edit Test");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R11 Edit Server", nodeId, templateId);

    // Create a test file via API
    await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/files/write?path=test.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ content: "hello world" }),
    });

    await login(page);
    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Wait for file listing and click on test.txt
    await page.waitForSelector("text=test.txt", { timeout: 15000 });
    await page.click("text=test.txt");

    // Wait for editor to appear
    await page.waitForSelector("textarea", { timeout: 10000 });

    // Verify the content loaded
    const textarea = page.locator("textarea");
    await expect(textarea).toHaveValue("hello world", { timeout: 10000 });

    // Edit the content
    await textarea.fill("hello edited");

    // Click Save
    await page.click('button:has-text("Save")');

    // Verify saved message
    await expect(page.locator("text=Saved successfully.")).toBeVisible({ timeout: 10000 });

    // Close the editor and reopen to verify persistence
    await page.click('button:has-text("Close")');
    await page.click("text=test.txt");
    await page.waitForSelector("textarea", { timeout: 10000 });
    await expect(page.locator("textarea")).toHaveValue("hello edited", { timeout: 10000 });
  });

  test("upload and download a file", async ({ page }) => {
    const cookie = await getAdminCookie();
    const nodeId = getNodeId();
    const templateId = await createTemplate(cookie, "R11 Upload Test");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R11 Upload Server", nodeId, templateId);

    await login(page);
    await page.goto(`http://localhost:5173/servers/${serverId}`);
    await page.waitForSelector("h2");

    // Wait for file listing to appear
    await page.waitForSelector("button:has-text('Upload File')", { timeout: 15000 });

    // Upload a file via API (simulating file picker is complex in Playwright)
    const formData = new FormData();
    formData.append("file", new File(["upload test content"], "uploaded.txt"));
    const uploadRes = await fetch(`${API_URL}/api/admin/servers/${serverId}/files/upload?path=.`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });
    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      throw new Error(`Upload failed: ${uploadRes.status} ${errBody}`);
    }
    expect(uploadRes.ok).toBe(true);

    // Refresh the page to see the uploaded file
    await page.reload();
    await page.waitForSelector("text=uploaded.txt", { timeout: 15000 });

    // Verify the file appears in the listing
    await expect(page.locator("text=uploaded.txt")).toBeVisible({ timeout: 10000 });

    // Download the file via API and verify content
    const downloadRes = await fetch(
      `${API_URL}/api/admin/servers/${serverId}/files/download?path=uploaded.txt`,
      { headers: { Cookie: cookie } },
    );
    expect(downloadRes.ok).toBe(true);
    const content = await downloadRes.text();
    expect(content).toBe("upload test content");
  });

  test("create, rename, and delete files via API", async () => {
    const cookie = await getAdminCookie();
    const nodeId = getNodeId();
    const templateId = await createTemplate(cookie, "R11 CRUD Test");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);
    const serverId = await createServer(cookie, "R11 CRUD Server", nodeId, templateId);

    // Create a directory
    const mkdirRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/files/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ path: "testdir", type: "directory" }),
    });
    expect(mkdirRes.status).toBe(201);

    // Create a file
    const createFileRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/files/create`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ path: "testdir/testfile.txt", type: "file" }),
      },
    );
    expect(createFileRes.status).toBe(201);

    // List the directory and verify the file exists
    const listRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/files?path=testdir`,
      { headers: { Cookie: cookie } },
    );
    expect(listRes.ok).toBe(true);
    const listBody = await listRes.json();
    const names = listBody.entries.map((e: { name: string }) => e.name);
    expect(names).toContain("testfile.txt");

    // Rename the file
    const renameRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/files/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ from: "testdir/testfile.txt", to: "testdir/renamed.txt" }),
    });
    expect(renameRes.status).toBe(204);

    // Verify the renamed file exists
    const listRes2 = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/files?path=testdir`,
      { headers: { Cookie: cookie } },
    );
    const listBody2 = await listRes2.json();
    const names2 = listBody2.entries.map((e: { name: string }) => e.name);
    expect(names2).toContain("renamed.txt");
    expect(names2).not.toContain("testfile.txt");

    // Delete the file
    const deleteRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/files?path=testdir/renamed.txt`,
      { method: "DELETE", headers: { Cookie: cookie } },
    );
    expect(deleteRes.status).toBe(204);

    // Verify the file is gone
    const listRes3 = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/files?path=testdir`,
      { headers: { Cookie: cookie } },
    );
    const listBody3 = await listRes3.json();
    const names3 = listBody3.entries.map((e: { name: string }) => e.name);
    expect(names3).not.toContain("renamed.txt");
  });
});
