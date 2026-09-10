import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

const API_URL = "http://localhost:3000";
const NODE_ID = "30d62239-1a03-414a-81ef-c1fd0f34093a";

test.describe("R6 US2: Server lifecycle via daemon API", () => {
  test.afterEach(async () => {
    // Clean up any remaining servers via API
    try {
      const cookie = await getAdminCookie();
      const listRes = await fetch(`${API_URL}/api/admin/servers?node_id=${NODE_ID}`, {
        headers: { Cookie: cookie },
      });
      if (listRes.ok) {
        const servers = await listRes.json();
        for (const s of servers) {
          await fetch(`${API_URL}/api/admin/servers/${s.serverId}?node_id=${NODE_ID}`, {
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
    const cookie = await getAdminCookie();
    const serverId = crypto.randomUUID();

    // Create server
    const createRes = await fetch(`${API_URL}/api/admin/servers?node_id=${NODE_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        serverId,
        image: "alpine:latest",
        startupCommand: "sleep infinity",
        environment: {},
        portMappings: [],
        resourceLimits: { memoryMb: 64, cpuLimit: 0.5 },
        volumePath: `/tmp/sigilpanel/volumes/${serverId}`,
      }),
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.state).toBe("running");

    // Get status
    const statusRes = await fetch(`${API_URL}/api/admin/servers/${serverId}?node_id=${NODE_ID}`, {
      headers: { Cookie: cookie },
    });
    expect(statusRes.status()).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.state).toBe("running");

    // Stop
    const stopRes = await fetch(
      `${API_URL}/api/admin/servers/${serverId}/stop?node_id=${NODE_ID}`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      },
    );
    expect(stopRes.status()).toBe(200);
    const stopBody = await stopRes.json();
    expect(stopBody.state).toBe("stopped");

    // Start (idempotent — should work after stop)
    const startRes = await fetch(
      `${API_URL}/api/admin/servers/${serverId}/start?node_id=${NODE_ID}`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      },
    );
    expect(startRes.status()).toBe(200);
    const startBody = await startRes.json();
    expect(startBody.state).toBe("running");

    // Start again (idempotent — no-op)
    const startAgainRes = await fetch(
      `${API_URL}/api/admin/servers/${serverId}/start?node_id=${NODE_ID}`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      },
    );
    expect(startAgainRes.status()).toBe(200);

    // Restart
    const restartRes = await fetch(
      `${API_URL}/api/admin/servers/${serverId}/restart?node_id=${NODE_ID}`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      },
    );
    expect(restartRes.status()).toBe(200);
    const restartBody = await restartRes.json();
    expect(restartBody.state).toBe("running");

    // Remove
    const removeRes = await fetch(`${API_URL}/api/admin/servers/${serverId}?node_id=${NODE_ID}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(removeRes.status()).toBe(204);

    // Verify removed
    const afterRemoveRes = await fetch(
      `${API_URL}/api/admin/servers/${serverId}?node_id=${NODE_ID}`,
      {
        headers: { Cookie: cookie },
      },
    );
    expect(afterRemoveRes.status()).toBe(404);
  });

  test("invalid config rejected", async () => {
    const cookie = await getAdminCookie();

    // Invalid serverId (not UUID)
    const invalidRes = await fetch(`${API_URL}/api/admin/servers?node_id=${NODE_ID}`, {
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
    expect(invalidRes.status()).toBe(400);
  });
});

async function getAdminCookie(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@sigilpanel.local", password: "admin12345" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}
