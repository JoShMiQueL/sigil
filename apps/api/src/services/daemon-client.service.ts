import { db, schema } from "@sigilpanel/db";
import type { LifecycleResponse, ServerConfiguration, ServerStatus } from "@sigilpanel/shared";
import { and, eq, isNull } from "drizzle-orm";
import { computeSignature } from "../lib/credentials";
import { decrypt } from "../lib/crypto";

/**
 * DaemonClient sends authenticated lifecycle commands to a node's daemon.
 * It signs requests with HMAC-SHA256 using the node's stored secret.
 */
export class DaemonClient {
  private baseUrl: string;
  private secretId: string;
  private secret: string;

  constructor(baseUrl: string, secretId: string, secret: string) {
    // Strip trailing slash for consistent URL building
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.secretId = secretId;
    this.secret = secret;
  }

  private sign(body: string): { signature: string; timestamp: string } {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = computeSignature(this.secret, timestamp, body);
    return { signature, timestamp: String(timestamp) };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const bodyStr = body !== undefined ? JSON.stringify(body) : "";
    const { signature, timestamp } = this.sign(bodyStr);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Node-Id": this.secretId,
      "X-Node-Signature": signature,
      "X-Node-Timestamp": timestamp,
    };

    const resp = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: bodyStr || undefined,
    });

    if (resp.status === 204) {
      return undefined as unknown as T;
    }

    const text = await resp.text();
    if (!resp.ok) {
      let errorBody: { error?: { code?: string; message?: string } };
      try {
        errorBody = JSON.parse(text);
      } catch {
        errorBody = {};
      }
      const code = errorBody.error?.code ?? "DAEMON_ERROR";
      const message = errorBody.error?.message ?? `daemon returned ${resp.status}`;
      throw new DaemonError(code, message, resp.status);
    }

    return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
  }

  async createServer(config: ServerConfiguration): Promise<LifecycleResponse> {
    return this.request<LifecycleResponse>("POST", "/servers", config);
  }

  async startServer(serverId: string): Promise<LifecycleResponse> {
    return this.request<LifecycleResponse>("POST", `/servers/${serverId}/start`);
  }

  async stopServer(serverId: string): Promise<LifecycleResponse> {
    return this.request<LifecycleResponse>("POST", `/servers/${serverId}/stop`);
  }

  async restartServer(serverId: string): Promise<LifecycleResponse> {
    return this.request<LifecycleResponse>("POST", `/servers/${serverId}/restart`);
  }

  async removeServer(serverId: string): Promise<void> {
    await this.request<void>("DELETE", `/servers/${serverId}`);
  }

  async getServerStatus(serverId: string): Promise<ServerStatus> {
    return this.request<ServerStatus>("GET", `/servers/${serverId}`);
  }

  async listServers(): Promise<ServerStatus[]> {
    return this.request<ServerStatus[]>("GET", `/servers`);
  }

  async health(): Promise<{ status: string; docker: string; servers: number }> {
    return this.request("GET", "/health");
  }

  async writeFile(serverId: string, path: string, data: string): Promise<void> {
    await this.request<void>("POST", `/servers/${serverId}/files/write`, { path, data });
  }

  async readFile(
    serverId: string,
    path: string,
  ): Promise<{ path: string; content: string; size: number }> {
    return this.request("GET", `/servers/${serverId}/files/read?path=${encodeURIComponent(path)}`);
  }

  async listFiles(serverId: string, path: string): Promise<{ path: string; entries: string[] }> {
    return this.request("GET", `/servers/${serverId}/files/list?path=${encodeURIComponent(path)}`);
  }

  async deleteFile(serverId: string, path: string): Promise<void> {
    await this.request<void>(
      "DELETE",
      `/servers/${serverId}/files/delete?path=${encodeURIComponent(path)}`,
    );
  }
}

export class DaemonError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "DaemonError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Creates a DaemonClient for a given node by looking up its credentials
 * and daemon URL from the database.
 */
export async function createDaemonClient(nodeId: string, daemonPort = 8080): Promise<DaemonClient> {
  const [node] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nodeId)).limit(1);

  if (!node) {
    throw new DaemonError("NODE_NOT_FOUND", `node ${nodeId} not found`, 404);
  }

  // Get the latest non-revoked credential
  const [cred] = await db
    .select()
    .from(schema.nodeCredentials)
    .where(and(eq(schema.nodeCredentials.nodeId, nodeId), isNull(schema.nodeCredentials.revokedAt)))
    .limit(1);

  if (!cred) {
    throw new DaemonError("NO_CREDENTIALS", `no active credentials for node ${nodeId}`, 404);
  }

  const secret = decrypt(cred.secretEncrypted);

  // Build daemon URL from node IP and default port
  const baseUrl = `http://${node.ipAddress}:${daemonPort}`;

  return new DaemonClient(baseUrl, cred.secretId, secret);
}
