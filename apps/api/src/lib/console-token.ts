import { SignJWT } from "jose";

const CONSOLE_TOKEN_TTL_SEC = 300; // 5 minutes

function getSecret(): Uint8Array {
  const secret = process.env.APP_SECRET ?? "sigil-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function signConsoleToken(serverId: string, userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    serverId,
    userId,
    scope: "console",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + CONSOLE_TOKEN_TTL_SEC)
    .sign(getSecret());
}
