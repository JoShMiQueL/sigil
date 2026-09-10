import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { computeSignature } from "../lib/credentials";
import { DaemonClient } from "./daemon-client.service";

const TEST_SECRET_ID = "sid-test";
const TEST_SECRET = "sigilnode_testsecret";
const TEST_BASE_URL = "http://localhost:8080";

function createClient() {
  return new DaemonClient(TEST_BASE_URL, TEST_SECRET_ID, TEST_SECRET);
}

function makeMockFetch(response: { status: number; body?: string }) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    // Capture request info from init (fetch was called with method, headers, body)
    const method = init?.method ?? "GET";
    const url = typeof input === "string" ? input : input.toString();
    const headers = new Headers(init?.headers);
    const body = (init?.body as string) ?? "";

    // Store for verification
    lastCaptured = { method, url, headers, body };

    return new Response(response.body ?? null, {
      status: response.status,
      headers: response.body ? { "Content-Type": "application/json" } : {},
    });
  }) as unknown as typeof globalThis.fetch;
}

let lastCaptured: { method: string; url: string; headers: Headers; body: string };

function verifyHeaders() {
  const { headers, body } = lastCaptured;
  expect(headers.get("X-Node-Id")).toBe(TEST_SECRET_ID);
  expect(headers.get("X-Node-Signature")).toBeTruthy();
  expect(headers.get("X-Node-Timestamp")).toBeTruthy();

  const timestamp = Number(headers.get("X-Node-Timestamp"));
  const expected = computeSignature(TEST_SECRET, timestamp, body);
  expect(headers.get("X-Node-Signature")).toBe(expected);
}

describe("DaemonClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("createServer sends correct signed POST", async () => {
    globalThis.fetch = makeMockFetch({
      status: 201,
      body: JSON.stringify({ serverId: "s1", state: "running", message: "created" }),
    });

    const client = createClient();
    const config = {
      serverId: "s1",
      image: "alpine:latest",
      startupCommand: "sleep infinity",
      environment: {},
      portMappings: [],
      resourceLimits: { memoryMb: 512, cpuLimit: 1.0, pidsLimit: 256 },
      volumePath: "/tmp/v",
    };

    const result = await client.createServer(config);
    expect(result.serverId).toBe("s1");
    expect(result.state).toBe("running");

    expect(lastCaptured.method).toBe("POST");
    expect(lastCaptured.url).toBe(`${TEST_BASE_URL}/servers`);
    verifyHeaders();
  });

  test("startServer sends correct signed POST", async () => {
    globalThis.fetch = makeMockFetch({
      status: 200,
      body: JSON.stringify({ serverId: "s1", state: "running" }),
    });

    const client = createClient();
    await client.startServer("s1");

    expect(lastCaptured.method).toBe("POST");
    expect(lastCaptured.url).toBe(`${TEST_BASE_URL}/servers/s1/start`);
    verifyHeaders();
  });

  test("stopServer sends correct signed POST", async () => {
    globalThis.fetch = makeMockFetch({
      status: 200,
      body: JSON.stringify({ serverId: "s1", state: "stopped" }),
    });

    const client = createClient();
    await client.stopServer("s1");

    expect(lastCaptured.method).toBe("POST");
    expect(lastCaptured.url).toBe(`${TEST_BASE_URL}/servers/s1/stop`);
    verifyHeaders();
  });

  test("removeServer sends correct signed DELETE and handles 204", async () => {
    globalThis.fetch = makeMockFetch({ status: 204 });

    const client = createClient();
    await client.removeServer("s1");

    expect(lastCaptured.method).toBe("DELETE");
    expect(lastCaptured.url).toBe(`${TEST_BASE_URL}/servers/s1`);
    verifyHeaders();
  });

  test("getServerStatus sends correct signed GET", async () => {
    globalThis.fetch = makeMockFetch({
      status: 200,
      body: JSON.stringify({ serverId: "s1", state: "running", containerId: "abc" }),
    });

    const client = createClient();
    const result = await client.getServerStatus("s1");
    expect(result.serverId).toBe("s1");
    expect(result.state).toBe("running");

    expect(lastCaptured.method).toBe("GET");
    expect(lastCaptured.url).toBe(`${TEST_BASE_URL}/servers/s1`);
    verifyHeaders();
  });

  test("health sends correct GET", async () => {
    globalThis.fetch = makeMockFetch({
      status: 200,
      body: JSON.stringify({ status: "ok", docker: "connected", servers: 0 }),
    });

    const client = createClient();
    const result = await client.health();
    expect(result.status).toBe("ok");
    expect(result.docker).toBe("connected");

    expect(lastCaptured.method).toBe("GET");
    expect(lastCaptured.url).toBe(`${TEST_BASE_URL}/health`);
  });

  test("throws DaemonError on 4xx", async () => {
    globalThis.fetch = makeMockFetch({
      status: 404,
      body: JSON.stringify({ error: { code: "SERVER_NOT_FOUND", message: "not found" } }),
    });

    const client = createClient();
    await expect(client.getServerStatus("s1")).rejects.toMatchObject({
      name: "DaemonError",
      code: "SERVER_NOT_FOUND",
      statusCode: 404,
    });
  });

  test("throws DaemonError on 5xx", async () => {
    globalThis.fetch = makeMockFetch({
      status: 503,
      body: JSON.stringify({ error: { code: "DOCKER_UNAVAILABLE", message: "docker down" } }),
    });

    const client = createClient();
    await expect(client.listServers()).rejects.toMatchObject({
      name: "DaemonError",
      code: "DOCKER_UNAVAILABLE",
      statusCode: 503,
    });
  });

  test("throws on network error", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;

    const client = createClient();
    await expect(client.health()).rejects.toThrow("fetch failed");
  });

  test("restartServer sends correct signed POST", async () => {
    globalThis.fetch = makeMockFetch({
      status: 200,
      body: JSON.stringify({ serverId: "s1", state: "running" }),
    });

    const client = createClient();
    await client.restartServer("s1");

    expect(lastCaptured.method).toBe("POST");
    expect(lastCaptured.url).toBe(`${TEST_BASE_URL}/servers/s1/restart`);
    verifyHeaders();
  });

  test("listServers sends correct signed GET", async () => {
    globalThis.fetch = makeMockFetch({
      status: 200,
      body: JSON.stringify([{ serverId: "s1", state: "running" }]),
    });

    const client = createClient();
    const result = await client.listServers();
    expect(result).toHaveLength(1);
    expect(result[0].serverId).toBe("s1");

    expect(lastCaptured.method).toBe("GET");
    expect(lastCaptured.url).toBe(`${TEST_BASE_URL}/servers`);
    verifyHeaders();
  });
});
