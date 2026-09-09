import { execSync } from "node:child_process";
import Redis from "ioredis";

export default async function globalSetup() {
  // Flush rate-limit keys so E2E tests start clean regardless of prior runs
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const keys = await redis.keys("rate:login:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  await redis.quit();

  // Seed admin user if not present (idempotent — skips if already exists)
  execSync("pnpm --filter @sigilpanel/api db:seed", {
    stdio: "pipe",
    cwd: process.cwd(),
  });
}
