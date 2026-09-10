import { type RegistryIndex, type RegistryIndexEntry, RegistryIndexSchema } from "@sigil/shared";

interface RegistryCredentials {
  url: string;
  authMethod: "none" | "token" | "basic";
  token: string | null;
  username: string | null;
  password: string | null;
}

function buildHeaders(
  registry: Pick<RegistryCredentials, "authMethod" | "token" | "username" | "password">,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (registry.authMethod === "token" && registry.token) {
    headers.Authorization = `Bearer ${registry.token}`;
  } else if (registry.authMethod === "basic" && registry.username && registry.password) {
    headers.Authorization = `Basic ${btoa(`${registry.username}:${registry.password}`)}`;
  }
  return headers;
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "***";
    }
    return u.toString();
  } catch {
    return url;
  }
}

export async function fetchRegistryIndex(registry: RegistryCredentials): Promise<RegistryIndex> {
  const indexUrl = `${registry.url.replace(/\/$/, "")}/index.yaml`;
  const headers = buildHeaders(registry);

  const res = await fetch(indexUrl, { headers });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new RegistryAuthError(`Auth failed for ${redactUrl(registry.url)}`);
    }
    throw new RegistryFetchError(
      `Failed to fetch index from ${redactUrl(registry.url)}: ${res.status}`,
    );
  }

  const text = await res.text();
  const parsed = Bun.YAML.parse(text);
  return RegistryIndexSchema.parse(parsed);
}

export async function fetchTemplateFile(
  registry: RegistryCredentials,
  entry: Pick<RegistryIndexEntry, "file">,
): Promise<string> {
  const fileUrl = `${registry.url.replace(/\/$/, "")}/${entry.file}`;
  const headers = buildHeaders(registry);

  const res = await fetch(fileUrl, { headers });
  if (!res.ok) {
    throw new RegistryFetchError(
      `Failed to fetch template file from ${redactUrl(fileUrl)}: ${res.status}`,
    );
  }

  return res.text();
}

export class RegistryFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryFetchError";
  }
}

export class RegistryAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryAuthError";
  }
}

export type { RegistryCredentials };
