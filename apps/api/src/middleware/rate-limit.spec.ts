import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted runs before vi.mock, so the mock instance is available when ioredis is imported
const mockRedis = vi.hoisted(() => {
  class InMemoryRedis {
    private store = new Map<string, string>();
    private ttls = new Map<string, number>();

    async mget(...keys: string[]): Promise<(string | null)[]> {
      return keys.map((k) => {
        this.checkTtl(k);
        return this.store.get(k) ?? null;
      });
    }

    async incr(key: string): Promise<number> {
      this.checkTtl(key);
      const val = Number(this.store.get(key) ?? 0) + 1;
      this.store.set(key, String(val));
      return val;
    }

    async expire(key: string, seconds: number): Promise<number> {
      if (!this.store.has(key)) return 0;
      this.ttls.set(key, Date.now() + seconds * 1000);
      return 1;
    }

    async del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const k of keys) {
        if (this.store.delete(k)) count++;
        this.ttls.delete(k);
      }
      return count;
    }

    async keys(pattern: string): Promise<string[]> {
      const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
      return Array.from(this.store.keys()).filter((k) => {
        this.checkTtl(k);
        return regex.test(k) && this.store.has(k);
      });
    }

    async quit(): Promise<void> {
      this.store.clear();
      this.ttls.clear();
    }

    pipeline() {
      const self = this;
      const ops: Array<() => Promise<unknown>> = [];
      return {
        incr(key: string) {
          ops.push(() => self.incr(key));
          return this;
        },
        expire(key: string, seconds: number) {
          ops.push(() => self.expire(key, seconds));
          return this;
        },
        async exec(): Promise<unknown[]> {
          return Promise.all(ops.map((op) => op()));
        },
      };
    }

    private checkTtl(key: string): void {
      const ttl = this.ttls.get(key);
      if (ttl && Date.now() > ttl) {
        this.store.delete(key);
        this.ttls.delete(key);
      }
    }

    _reset(): void {
      this.store.clear();
      this.ttls.clear();
    }

    _get(key: string): string | null {
      this.checkTtl(key);
      return this.store.get(key) ?? null;
    }
  }
  return new InMemoryRedis();
});

vi.mock("ioredis", () => {
  return {
    default: function RedisMock() {
      return mockRedis;
    },
  };
});

// Do NOT mock the rate-limit module — we want to test the real implementation
import { app } from "../index";
import { cleanupDatabase, createAdmin } from "../test/helpers";

function makeRequest(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body) headers["Content-Type"] = "application/json";
  return Promise.resolve(
    app.request(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

describe("rate-limit [US1: login rate limiting]", () => {
  beforeEach(async () => {
    mockRedis._reset();
    await cleanupDatabase();
    await createAdmin("rl-admin@test.local", "admin12345");
  });

  afterEach(async () => {
    mockRedis._reset();
    await cleanupDatabase();
  });

  it("allows up to 5 failed logins per email, then returns 429", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest("/api/auth/login", {
        method: "POST",
        body: { email: "rl-admin@test.local", password: "wrongpass" },
      });
      expect(res.status).toBe(401);
    }

    // 6th attempt with same email → 429
    const res = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: "rl-admin@test.local", password: "wrongpass" },
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Too many attempts");
  });

  it("rate limit is per-email, not global", async () => {
    // Exhaust limit for email A
    for (let i = 0; i < 5; i++) {
      await makeRequest("/api/auth/login", {
        method: "POST",
        body: { email: "rl-admin@test.local", password: "wrongpass" },
      });
    }

    // Email A is now blocked
    const blocked = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: "rl-admin@test.local", password: "wrongpass" },
    });
    expect(blocked.status).toBe(429);

    // A different email should still work (per-email limit)
    const res = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: "other@test.local", password: "wrongpass" },
    });
    expect(res.status).toBe(401); // Not 429 — different email
  });

  it("does not count successful logins toward the limit", async () => {
    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      await makeRequest("/api/auth/login", {
        method: "POST",
        body: { email: "rl-admin@test.local", password: "wrongpass" },
      });
    }

    // Successful login should not increment the counter
    const okRes = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: "rl-admin@test.local", password: "admin12345" },
    });
    expect(okRes.status).toBe(200);

    // Should still have 1 attempt left (4 failures, 5 is the limit)
    const res = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: "rl-admin@test.local", password: "wrongpass" },
    });
    expect(res.status).toBe(401); // Not 429 — still under limit
  });

  it("returns 429 after 10 failed attempts from the same IP (different emails)", async () => {
    // 10 failures from same IP with different emails
    for (let i = 0; i < 10; i++) {
      const res = await makeRequest("/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": "1.2.3.4" },
        body: { email: `user${i}@test.local`, password: "wrongpass" },
      });
      expect(res.status).toBe(401);
    }

    // 11th attempt from same IP with a new email → 429 (IP limit = 10)
    const res = await makeRequest("/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
      body: { email: "user10@test.local", password: "wrongpass" },
    });
    expect(res.status).toBe(429);
  });

  it("email limit is per-email (global, not per-IP)", async () => {
    // Exhaust email limit for "blocked@test.local" from IP 1.2.3.4
    for (let i = 0; i < 5; i++) {
      await makeRequest("/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": "1.2.3.4" },
        body: { email: "blocked@test.local", password: "wrongpass" },
      });
    }

    // Same email from a different IP should still be blocked
    // (email limit is global — protects the account regardless of source IP)
    const res = await makeRequest("/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "5.6.7.8" },
      body: { email: "blocked@test.local", password: "wrongpass" },
    });
    expect(res.status).toBe(429);
  });

  it("IP limit does not block a different IP with a different email", async () => {
    // 5 failures from IP 1.2.3.4 with email A (exhaust email limit for A)
    for (let i = 0; i < 5; i++) {
      await makeRequest("/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": "1.2.3.4" },
        body: { email: "email-a@test.local", password: "wrongpass" },
      });
    }

    // Different IP + different email should work fine
    const res = await makeRequest("/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "5.6.7.8" },
      body: { email: "email-b@test.local", password: "wrongpass" },
    });
    expect(res.status).toBe(401); // Not 429 — different IP and different email
  });
});
