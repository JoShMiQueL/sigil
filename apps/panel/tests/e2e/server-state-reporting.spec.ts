import { expect, test } from "@playwright/test";
import { cleanupDatabase } from "./helpers";

const API_URL = "http://localhost:3000";
const NODE_ID = "30d62239-1a03-414a-81ef-c1fd0f34093a";

test.describe("R6 US4: Server state reporting", () => {
  test.afterEach(async () => {
    await cleanupDatabase();
  });

  test("container crash is detected and reported to panel", async () => {
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
        volumePath: `/tmp/sigil/volumes/${serverId}`,
      }),
    });
    expect(createRes.status()).toBe(201);

    // Kill the container directly via Docker
    const { execSync } = await import("node:child_process");
    const containerId = execSync(`docker ps --filter "label=sigil.server-id=${serverId}" -q`)
      .toString()
      .trim();
    expect(containerId).toBeTruthy();
    execSync(`docker kill ${containerId}`);

    // Wait for daemon to detect and report state change
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Verify panel shows crashed state
    const statusRes = await fetch(`${API_URL}/api/admin/servers/${serverId}?node_id=${NODE_ID}`, {
      headers: { Cookie: cookie },
    });
    expect(statusRes.status()).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.state).toBe("crashed");
  });

  test("startup reconciliation reports existing containers", async () => {
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
        volumePath: `/tmp/sigil/volumes/${serverId}`,
      }),
    });
    expect(createRes.status()).toBe(201);

    // Verify running
    const statusRes = await fetch(`${API_URL}/api/admin/servers/${serverId}?node_id=${NODE_ID}`, {
      headers: { Cookie: cookie },
    });
    const statusBody = await statusRes.json();
    expect(statusBody.state).toBe("running");

    // Clean up
    await fetch(`${API_URL}/api/admin/servers/${serverId}?node_id=${NODE_ID}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
  });

  test("intentional stop reports stopped state (not crashed)", async () => {
    const cookie = await getAdminCookie();
    const serverId = crypto.randomUUID();

    // Create server
    await fetch(`${API_URL}/api/admin/servers?node_id=${NODE_ID}`, {
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

    // Stop via API (intentional)
    const stopRes = await fetch(
      `${API_URL}/api/admin/servers/${serverId}/stop?node_id=${NODE_ID}`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      },
    );
    expect(stopRes.status()).toBe(200);

    // Wait for state to settle
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify state is "stopped", not "crashed"
    const statusRes = await fetch(`${API_URL}/api/admin/servers/${serverId}?node_id=${NODE_ID}`, {
      headers: { Cookie: cookie },
    });
    const statusBody = await statusRes.json();
    expect(statusBody.state).toBe("stopped");
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
