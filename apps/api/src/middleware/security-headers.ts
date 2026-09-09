import { createMiddleware } from "hono/factory";
import type { AuthContext } from "./auth";

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export const cspMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  await next();
  c.header("Content-Security-Policy", CSP_DIRECTIVES);
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
});
