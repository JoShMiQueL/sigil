import { type ChildProcess, execSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { schema } from "../packages/db/src/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_FOLDER = join(ROOT, "packages/db/drizzle");
const API_URL = "http://localhost:3000";
const DAEMON_BIN = "/tmp/sigil-daemon";
const DAEMON_CONFIG = "/tmp/sigil-daemon-e2e.yaml";
const DAEMON_CREDS = "/tmp/sigil-daemon-e2e-creds.json";

let apiProcess: ChildProcess | null = null;
let daemonProcess: ChildProcess | null = null;

async function waitForApi(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) return;
    } catch {
      // API not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("API did not become healthy within 30 seconds");
}

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
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Daemon did not register within 30 seconds");
}

async function main() {
  console.log("[e2e] Building panel for production...");
  execSync("bun --filter @sigil/panel build", { cwd: ROOT, stdio: "inherit" });
  console.log("[e2e] Panel build complete.");

  console.log("[e2e] Building daemon binary...");
  execSync("go build -o /tmp/sigil-daemon ./cmd/daemon/", {
    cwd: join(ROOT, "apps/daemon"),
    stdio: "inherit",
  });
  console.log("[e2e] Daemon binary built.");

  console.log("[e2e] Starting PostgreSQL + Redis testcontainers...");
  const pg = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("sigil_test")
    .withUsername("sigil")
    .withPassword("sigil")
    .start();

  const redis = await new RedisContainer("redis:8-alpine").start();

  const dbUrl = pg.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getPort()}`;

  console.log(`[e2e] PostgreSQL ready: ${dbUrl}`);
  console.log(`[e2e] Redis ready: ${redisUrl}`);

  // Run migrations
  console.log("[e2e] Running migrations...");
  const client = postgres(dbUrl, { max: 5 });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await client.end();
  console.log("[e2e] Migrations applied.");

  // Seed admin user
  console.log("[e2e] Seeding admin user...");
  execSync("bun --filter @sigil/api db:seed", {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  // Start API as a background process (Playwright's webServer will reuse it)
  console.log("[e2e] Starting API server...");
  apiProcess = spawn("bun", ["src/index.ts"], {
    cwd: join(ROOT, "apps/api"),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      REDIS_URL: redisUrl,
      NODE_ENV: "development",
      RATE_LIMIT_DISABLED: "1",
    },
  });
  apiProcess.stdout?.on("data", (data) => {
    console.log(`[api] ${data.toString().trim()}`);
  });
  apiProcess.stderr?.on("data", (data) => {
    console.error(`[api] ${data.toString().trim()}`);
  });

  console.log("[e2e] Waiting for API to be healthy...");
  await waitForApi();
  console.log("[e2e] API is healthy.");

  // Clean up any leftover containers from previous runs
  try {
    execSync('docker ps -q --filter "label=sigil.server-id" | xargs -r docker rm -f', {
      stdio: "ignore",
    });
  } catch {
    // No containers to clean
  }

  // Kill any previous daemon processes and clean up credentials
  try {
    execSync("pkill -f sigil-daemon", { stdio: "ignore" });
  } catch {
    // No previous daemon running
  }
  try {
    execSync(`rm -f ${DAEMON_CREDS}`, { stdio: "ignore" });
  } catch {
    // No credentials file to remove
  }

  // Register daemon: login, create region, generate pairing token
  console.log("[e2e] Registering daemon with panel...");
  const cookie = await adminLogin();
  const regionId = await createRegion(cookie);
  const token = await generatePairingToken(cookie, regionId);

  // Write daemon config
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

  // Start daemon
  console.log("[e2e] Starting daemon...");
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

  console.log("[e2e] Waiting for daemon to register...");
  const nodeId = await waitForNode(cookie, "e2e-daemon");
  console.log(`[e2e] Daemon registered, node ID: ${nodeId}`);

  // Run Playwright with production builds and testcontainers
  // NODE_ENV=development enables the test-cleanup endpoint between tests
  // E2E_NODE_ID passes the registered daemon's node ID to the R6 tests
  console.log("[e2e] Starting Playwright (production builds)...");
  const playwright = spawn("bun", ["--filter", "@sigil/panel", "test:e2e"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      REDIS_URL: redisUrl,
      NODE_ENV: "development",
      RATE_LIMIT_DISABLED: "1",
      E2E_NODE_ID: nodeId,
    },
  });

  // Cleanup on exit
  const cleanup = async () => {
    console.log("[e2e] Stopping daemon...");
    if (daemonProcess) {
      daemonProcess.kill("SIGTERM");
    }
    console.log("[e2e] Stopping API...");
    if (apiProcess) {
      apiProcess.kill("SIGTERM");
    }
    console.log("[e2e] Stopping testcontainers...");
    await pg.stop();
    await redis.stop();
    console.log("[e2e] Testcontainers stopped.");
  };

  process.on("SIGINT", () => {
    playwright.kill("SIGINT");
  });
  process.on("SIGTERM", () => {
    playwright.kill("SIGTERM");
  });

  playwright.on("exit", async (code) => {
    await cleanup();
    process.exit(code ?? 1);
  });
}

main().catch(async (err) => {
  console.error("[e2e] Fatal error:", err);
  if (daemonProcess) daemonProcess.kill("SIGTERM");
  if (apiProcess) apiProcess.kill("SIGTERM");
  process.exit(1);
});
