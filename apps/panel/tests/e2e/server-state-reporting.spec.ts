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
  nodeId: string,
  templateId: string,
  name: string,
): Promise<{ id: string }> {
  const res = await fetchRetry(`${API_URL}/api/admin/servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, nodeId, templateId, variables: {} }),
  });
  const body = await res.json();
  return { id: body.id };
}

test.describe("R6 US4: Server state reporting (R9 panel-owned)", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("container crash is detected and reported to panel", async () => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    const templateId = await createTemplate(cookie, "Crash Test Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    const { id: serverId } = await createServer(cookie, nodeId, templateId, "Crash Test Server");

    // Kill the container directly via Docker
    const { execSync } = await import("node:child_process");
    const containerId = execSync(`docker ps --filter "label=sigil.server-id=${serverId}" -q`)
      .toString()
      .trim();
    expect(containerId).toBeTruthy();
    execSync(`docker kill ${containerId}`);

    // Wait for daemon to detect and report state change
    await new Promise((r) => setTimeout(r, 5000));

    // Verify panel shows crashed state
    const statusRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}`, {
      headers: { Cookie: cookie },
    });
    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.status).toBe("crashed");
  });

  test("startup reconciliation reports existing containers", async () => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    const templateId = await createTemplate(cookie, "Reconcile Test Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    const { id: serverId } = await createServer(
      cookie,
      nodeId,
      templateId,
      "Reconcile Test Server",
    );

    // Verify running
    const statusRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}`, {
      headers: { Cookie: cookie },
    });
    const statusBody = await statusRes.json();
    expect(statusBody.status).toBe("running");

    // Clean up
    await fetchRetry(`${API_URL}/api/admin/servers/${serverId}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
  });

  test("intentional stop reports stopped state (not crashed)", async () => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    const templateId = await createTemplate(cookie, "Stop Test Template");
    await activateTemplate(cookie, templateId);
    await addAllocations(cookie, nodeId);

    const { id: serverId } = await createServer(cookie, nodeId, templateId, "Stop Test Server");

    // Stop via API (intentional)
    const stopRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/power`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ action: "stop" }),
    });
    expect(stopRes.status).toBe(200);

    // Wait for state to settle
    await new Promise((r) => setTimeout(r, 3000));

    // Verify state is "stopped", not "crashed"
    const statusRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}`, {
      headers: { Cookie: cookie },
    });
    const statusBody = await statusRes.json();
    expect(statusBody.status).toBe("stopped");
  });
});
