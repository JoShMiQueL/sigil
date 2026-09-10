import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

const API_URL = "http://localhost:3000";

function getNodeId(): string {
  return readFileSync("/tmp/sigil-e2e-node-id", "utf-8").trim();
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

test.describe("R6 US2: Server lifecycle via daemon API", () => {
  test.afterEach(async () => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();
    try {
      const listRes = await fetchRetry(`${API_URL}/api/admin/servers?node_id=${nodeId}`, {
        headers: { Cookie: cookie },
      });
      if (listRes.ok) {
        const servers = await listRes.json();
        for (const s of servers) {
          await fetchRetry(`${API_URL}/api/admin/servers/${s.serverId}?node_id=${nodeId}`, {
            method: "DELETE",
            headers: { Cookie: cookie },
          });
        }
      }
    } catch {
      // Best-effort cleanup
    }
    await cleanupDatabase();
  });

  test("create, start, stop, restart, remove server lifecycle", async () => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();
    const serverId = crypto.randomUUID();

    // Create server
    const createRes = await fetchRetry(`${API_URL}/api/admin/servers?node_id=${nodeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        serverId,
        image: "alpine:latest",
        startupCommand: "sleep infinity",
        environment: {},
        portMappings: [],
        resourceLimits: { memoryMb: 64, cpuLimit: 0.5 },
        volumePath: `/tmp/sigil/volumes/${serverId}`,
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.state).toBe("running");

    // Get status
    const statusRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}?node_id=${nodeId}`,
      {
        headers: { Cookie: cookie },
      },
    );
    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.state).toBe("running");

    // Stop
    const stopRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/stop?node_id=${nodeId}`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      },
    );
    expect(stopRes.status).toBe(200);
    const stopBody = await stopRes.json();
    expect(stopBody.state).toBe("stopped");

    // Start
    const startRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/start?node_id=${nodeId}`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      },
    );
    expect(startRes.status).toBe(200);
    const startBody = await startRes.json();
    expect(startBody.state).toBe("running");

    // Start again (idempotent)
    const startAgainRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/start?node_id=${nodeId}`,
      { method: "POST", headers: { Cookie: cookie } },
    );
    expect(startAgainRes.status).toBe(200);

    // Restart
    const restartRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}/restart?node_id=${nodeId}`,
      { method: "POST", headers: { Cookie: cookie } },
    );
    expect(restartRes.status).toBe(200);
    const restartBody = await restartRes.json();
    expect(restartBody.state).toBe("running");

    // Wait for daemon state to settle after restart
    await new Promise((r) => setTimeout(r, 2000));

    // Remove
    const removeRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}?node_id=${nodeId}`,
      {
        method: "DELETE",
        headers: { Cookie: cookie },
      },
    );
    expect(removeRes.status).toBe(204);

    // Verify removed
    const afterRemoveRes = await fetchRetry(
      `${API_URL}/api/admin/servers/${serverId}?node_id=${nodeId}`,
      { headers: { Cookie: cookie } },
    );
    expect(afterRemoveRes.status).toBe(404);
  });

  test("invalid config rejected", async () => {
    const nodeId = getNodeId();
    const cookie = await getAdminCookie();

    const invalidRes = await fetchRetry(`${API_URL}/api/admin/servers?node_id=${nodeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        serverId: "not-a-uuid",
        image: "alpine:latest",
        startupCommand: "sleep infinity",
        environment: {},
        portMappings: [],
        resourceLimits: { memoryMb: 64, cpuLimit: 0.5 },
        volumePath: "/tmp/v",
      }),
    });
    expect(invalidRes.status).toBe(400);
  });
});

async function getAdminCookie(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@sigil.local", password: "admin12345" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}
