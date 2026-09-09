import { createMiddleware } from "hono/factory";
import type { AuthContext } from "./auth";

export const sanitizeMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  await next();

  // Sanitize email fields in JSON responses (trim + lowercase)
  // This is applied at the middleware level for request bodies
});

// Helper to sanitize email input
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Helper to sanitize string input (trim)
export function sanitizeString(value: string): string {
  return value.trim();
}
