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

async function createUser(cookie: string, email: string, username: string): Promise<string> {
  const res = await fetchRetry(`${API_URL}/api/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ email, username, password: "userpass123" }),
  });
  const body = await res.json();
  return body.user.id;
}

async function loginAs(email: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "userpass123" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

const NO_PERMS = {
  console: false,
  files: false,
  backups: false,
  power: false,
  settings: false,
  members: false,
  allocations: false,
  databases: false,
};

test.describe("members [R13]", () => {
  let cookie: string;
  let nodeId: string;
  let templateId: string;
  let serverId: string;

  test.beforeAll(async () => {
    cookie = await getAdminCookie();
    nodeId = getNodeId();
    await addAllocations(cookie, nodeId);
    templateId = await createTemplate(cookie, "member-e2e-template");
    await activateTemplate(cookie, templateId);
    serverId = await createServer(cookie, "member-e2e-server", nodeId, templateId);
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

  test("list members returns owner for new server", async () => {
    const res = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    const owner = body.members.find((m: { role: string }) => m.role === "owner");
    expect(owner).toBeDefined();
  });

  test("add member via API and verify in list", async () => {
    const userId = await createUser(cookie, "member-e2e@test.local", "member-e2e");
    expect(userId).toBeDefined();

    const addRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ email: "member-e2e@test.local", permissions: NO_PERMS }),
    });
    expect(addRes.status).toBe(201);
    const addBody = await addRes.json();
    expect(addBody.role).toBe("member");

    const listRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const found = listBody.members.find((m: { email: string }) => m.email === "member-e2e@test.local");
    expect(found).toBeDefined();
  });

  test("subuser can see server after being added as member", async () => {
    await createUser(cookie, "subuser-e2e@test.local", "subuser-e2e");
    await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ email: "subuser-e2e@test.local", permissions: NO_PERMS }),
    });

    const subCookie = await loginAs("subuser-e2e@test.local");
    const res = await fetchRetry(`${API_URL}/api/admin/servers`, {
      method: "GET",
      headers: { Cookie: subCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers.length).toBeGreaterThanOrEqual(1);
    const found = body.servers.find((s: { id: string }) => s.id === serverId);
    expect(found).toBeDefined();
  });

  test("subuser without membership sees no servers", async () => {
    await createUser(cookie, "nomember-e2e@test.local", "nomember-e2e");
    const subCookie = await loginAs("nomember-e2e@test.local");
    const res = await fetchRetry(`${API_URL}/api/admin/servers`, {
      method: "GET",
      headers: { Cookie: subCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toEqual([]);
  });

  test("update member permissions via API", async () => {
    await createUser(cookie, "update-e2e@test.local", "update-e2e");
    const addRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ email: "update-e2e@test.local", permissions: NO_PERMS }),
    });
    expect(addRes.status).toBe(201);
    const addBody = await addRes.json();
    const memberId = addBody.id;

    const updateRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/members/${memberId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          permissions: { ...NO_PERMS, console: true, files: true },
        }),
      },
    );
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.permissions.console).toBe(true);
    expect(updateBody.permissions.files).toBe(true);
  });

  test("remove member via API", async () => {
    await createUser(cookie, "remove-e2e@test.local", "remove-e2e");
    const addRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ email: "remove-e2e@test.local", permissions: NO_PERMS }),
    });
    expect(addRes.status).toBe(201);
    const addBody = await addRes.json();
    const memberId = addBody.id;

    const delRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/members/${memberId}`,
      {
        method: "DELETE",
        headers: { Cookie: cookie },
      },
    );
    expect(delRes.status).toBe(200);

    const listRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    const listBody = await listRes.json();
    const found = listBody.members.find((m: { id: string }) => m.id === memberId);
    expect(found).toBeUndefined();
  });

  test("cannot remove owner", async () => {
    const listRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    const listBody = await listRes.json();
    const owner = listBody.members.find((m: { role: string }) => m.role === "owner");

    const delRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/members/${owner.id}`,
      {
        method: "DELETE",
        headers: { Cookie: cookie },
      },
    );
    expect(delRes.status).toBe(403);
  });

  test("transfer ownership via API", async () => {
    await createUser(cookie, "newowner-e2e@test.local", "newowner-e2e");
    const addRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ email: "newowner-e2e@test.local", permissions: NO_PERMS }),
    });
    expect(addRes.status).toBe(201);
    const addBody = await addRes.json();
    const newOwnerId = addBody.id;

    const transferRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/members/transfer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ newOwnerId }),
      },
    );
    expect(transferRes.status).toBe(200);

    const listRes = await fetchRetry(`${API_URL}/api/admin/servers/${serverId}/members`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    const listBody = await listRes.json();
    const newOwner = listBody.members.find((m: { id: string }) => m.id === newOwnerId);
    expect(newOwner.role).toBe("owner");
  });
});
