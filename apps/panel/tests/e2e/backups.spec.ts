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
      image: "eclipse-temurin:21-jre",
      startupCommand: "java -jar server.jar",
      resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
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

async function deleteServer(cookie: string, serverId: string): Promise<void> {
  await fetchRetry(`${API_URL}/api/admin/servers/${serverId}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

test.describe("backups [R12]", () => {
  let cookie: string;
  let nodeId: string;
  let templateId: string;
  let serverId: string;

  test.beforeAll(async () => {
    cookie = await getAdminCookie();
    nodeId = getNodeId();
    await addAllocations(cookie, nodeId);
    templateId = await createTemplate(cookie, "backup-e2e-template");
    await activateTemplate(cookie, templateId);
    serverId = await createServer(cookie, "backup-e2e-server", nodeId, templateId);
  });

  test.afterAll(async () => {
    if (serverId) {
      try {
        await deleteServer(cookie, serverId);
      } catch {
        // ignore
      }
    }
    await cleanupDatabase();
  });

  test("list backups returns empty for new server", async () => {
    const res = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/backups`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backups).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("create backup via API and verify in list", async () => {
    const createRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/backups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "e2e-test-backup" }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.name).toBe("e2e-test-backup");

    const listRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/backups`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.total).toBeGreaterThanOrEqual(1);
    const found = listBody.backups.find((b: { name: string }) => b.name === "e2e-test-backup");
    expect(found).toBeDefined();
  });

  test("delete backup via API", async () => {
    const createRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/backups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "e2e-delete-backup" }),
    });
    const createBody = await createRes.json();
    const backupId = createBody.id;

    const deleteRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/backups/${backupId}`,
      {
        method: "DELETE",
        headers: { Cookie: cookie },
      },
    );
    expect(deleteRes.status).toBe(204);

    const listRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/backups`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    const listBody = await listRes.json();
    const found = listBody.backups.find((b: { id: string }) => b.id === backupId);
    expect(found).toBeUndefined();
  });

  test("get default storage config for node", async () => {
    const res = await fetchRetry(`${API_URL}/api/admin/nodes/${nodeId}/backup-storage`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backend).toBe("local");
    expect(body.maxBackupSizeGb).toBe(10);
  });

  test("update storage config to local with custom max size", async () => {
    const res = await fetchRetry(`${API_URL}/api/admin/nodes/${nodeId}/backup-storage`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ backend: "local", maxBackupSizeGb: 20 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backend).toBe("local");
    expect(body.maxBackupSizeGb).toBe(20);
  });

  test("rejects invalid backup name", async () => {
    const res = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/backups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "invalid/name" }),
    });
    expect(res.status).toBe(400);
  });
});
