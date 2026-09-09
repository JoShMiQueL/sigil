import { createMiddleware } from "hono/factory";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 10;

const RATE_LIMIT_DISABLED =
  process.env.RATE_LIMIT_DISABLED === "1" && process.env.NODE_ENV !== "production";

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  if (RATE_LIMIT_DISABLED) {
    await next();
    return;
  }

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  const email = c.req.header("x-login-email") ?? "unknown";

  const emailKey = `rate:login:email:${email}`;
  const ipKey = `rate:login:ip:${ip}`;

  const [emailCount, ipCount] = await redis.mget(emailKey, ipKey);

  const emailAttempts = Number(emailCount ?? 0);
  const ipAttempts = Number(ipCount ?? 0);

  if (emailAttempts >= MAX_ATTEMPTS || ipAttempts >= MAX_IP_ATTEMPTS) {
    return c.json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }

  await next();

  // Only increment on failed login (status 401)
  if (c.res.status === 401) {
    const pipeline = redis.pipeline();
    pipeline.incr(emailKey);
    pipeline.expire(emailKey, WINDOW_SECONDS);
    pipeline.incr(ipKey);
    pipeline.expire(ipKey, WINDOW_SECONDS);
    await pipeline.exec();
  }
});

// Explicit rate-limit check + record functions for routes that have
// the identifier (e.g. email) from the parsed body, not from a header.
export async function checkRateLimit(ip: string, email: string): Promise<boolean> {
  if (RATE_LIMIT_DISABLED) return true;

  const emailKey = `rate:login:email:${email}`;
  const ipKey = `rate:login:ip:${ip}`;

  const [emailCount, ipCount] = await redis.mget(emailKey, ipKey);
  const emailAttempts = Number(emailCount ?? 0);
  const ipAttempts = Number(ipCount ?? 0);

  return emailAttempts < MAX_ATTEMPTS && ipAttempts < MAX_IP_ATTEMPTS;
}

export async function recordFailedAttempt(ip: string, email: string): Promise<void> {
  if (RATE_LIMIT_DISABLED) return;

  const emailKey = `rate:login:email:${email}`;
  const ipKey = `rate:login:ip:${ip}`;

  const pipeline = redis.pipeline();
  pipeline.incr(emailKey);
  pipeline.expire(emailKey, WINDOW_SECONDS);
  pipeline.incr(ipKey);
  pipeline.expire(ipKey, WINDOW_SECONDS);
  await pipeline.exec();
}

export { MAX_ATTEMPTS, MAX_IP_ATTEMPTS, WINDOW_SECONDS };
