/**
 * Playwright globalSetup: starts a real daemon for R6 E2E tests.
 *
 * Flow:
 * 1. Login as admin
 * 2. Create a region
 * 3. Generate a pairing token
 * 4. Write daemon config
 * 5. Start daemon binary
 * 6. Wait for registration
 * 7. Write node ID to file for tests to read
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API_URL = "http://localhost:3000";
const DAEMON_BIN = "/tmp/sigil-daemon";
const DAEMON_CONFIG = "/tmp/sigil-daemon-e2e.yaml";
const DAEMON_CREDS = "/tmp/sigil-daemon-e2e-creds.json";
const NODE_ID_FILE = "/tmp/sigil-e2e-node-id";

let daemonProcess: ReturnType<typeof spawn> | null = null;

async function adminLogin(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@sigil.local", password: "admin12345" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

async function createRegion(cookie: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/admin/regions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "e2e-daemon-region" }),
  });
  const body = await res.json();
  return body.id;
}

async function generatePairingToken(cookie: string, regionId: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/admin/pairing/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ regionId }),
  });
  const body = await res.json();
  return body.token;
}

async function waitForNode(cookie: string, hostname: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${API_URL}/api/admin/nodes`, {
      headers: { Cookie: cookie },
    });
    if (res.ok) {
      const nodes = await res.json();
      const node = nodes.find((n: { hostname: string }) => n.hostname === hostname);
      if (node) {
        return node.id;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Daemon did not register within 30 seconds");
}

export default async function globalSetup() {
  // Skip if daemon binary doesn't exist
  if (!existsSync(DAEMON_BIN)) {
    console.log("[global-setup] Daemon binary not found, building...");
    execSync(
      "cd /home/josemi/dev/sigil/apps/daemon && go build -o /tmp/sigil-daemon ./cmd/daemon/",
      {
        stdio: "inherit",
      },
    );
  }

  // Clean up previous state
  if (existsSync(DAEMON_CREDS)) {
    execSync(`rm -f ${DAEMON_CREDS}`);
  }

  // Kill any previous daemon processes
  try {
    execSync("pkill -f sigil-daemon", { stdio: "ignore" });
  } catch {
    // No previous daemon running
  }

  // Clean up any leftover containers from previous runs
  try {
    execSync('docker ps -q --filter "label=sigil.server-id" | xargs -r docker rm -f', {
      stdio: "ignore",
    });
  } catch {
    // No containers to clean
  }

  console.log("[global-setup] Logging in as admin...");
  const cookie = await adminLogin();

  console.log("[global-setup] Creating region...");
  const regionId = await createRegion(cookie);

  console.log("[global-setup] Generating pairing token...");
  const token = await generatePairingToken(cookie, regionId);

  console.log("[global-setup] Writing daemon config...");
  writeFileSync(
    DAEMON_CONFIG,
    `panel_url: http://localhost:3000
pairing_token: ${token}
credentials_path: ${DAEMON_CREDS}
volume_base_path: /tmp/sigil/volumes
docker_socket: /var/run/docker.sock
listen_address: 127.0.0.1:8080
advertise_ip: 127.0.0.1
hostname: e2e-daemon
heartbeat_interval_sec: 5
stop_timeout_sec: 10
disk_full_threshold_pct: 95
uid_range_start: 10000
uid_range_end: 20000
log_level: info
`,
  );

  console.log("[global-setup] Starting daemon...");
  daemonProcess = spawn(DAEMON_BIN, ["--config", DAEMON_CONFIG], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  daemonProcess.stdout?.on("data", (data) => {
    console.log(`[daemon] ${data.toString().trim()}`);
  });
  daemonProcess.stderr?.on("data", (data) => {
    console.error(`[daemon] ${data.toString().trim()}`);
  });

  console.log("[global-setup] Waiting for daemon to register...");
  const nodeId = await waitForNode(cookie, "e2e-daemon");
  console.log(`[global-setup] Daemon registered, node ID: ${nodeId}`);

  // Write node ID to file for tests to read
  mkdirSync("/tmp/sigil-e2e", { recursive: true });
  writeFileSync(NODE_ID_FILE, nodeId);
}

// Cleanup on process exit
process.on("exit", () => {
  if (daemonProcess) {
    daemonProcess.kill("SIGTERM");
  }
});
