import { execSync, spawn } from "node:child_process";
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

async function main() {
  console.log("[e2e] Building panel for production...");
  execSync("pnpm --filter @sigilpanel/panel build", { cwd: ROOT, stdio: "inherit" });
  console.log("[e2e] Panel build complete.");

  console.log("[e2e] Starting PostgreSQL + Redis testcontainers...");
  const pg = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("sigilpanel_test")
    .withUsername("sigilpanel")
    .withPassword("sigilpanel")
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
  execSync("pnpm --filter @sigilpanel/api db:seed", {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  // Run Playwright with production builds and testcontainers
  // NODE_ENV=development enables the test-cleanup endpoint between tests
  console.log("[e2e] Starting Playwright (production builds)...");
  const playwright = spawn("pnpm", ["--filter", "@sigilpanel/panel", "test:e2e"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      REDIS_URL: redisUrl,
      NODE_ENV: "development",
      RATE_LIMIT_DISABLED: "1",
    },
  });

  // Cleanup on exit
  const cleanup = async () => {
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
  process.exit(1);
});
