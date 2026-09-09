import Redis from "ioredis";

export default async function globalSetup() {
  // Flush rate-limit keys so E2E tests start clean regardless of prior runs
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const keys = await redis.keys("rate:login:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  await redis.quit();
}
