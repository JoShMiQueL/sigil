import type { Context } from "hono";

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export function errorResponse(c: Context, status: number, error: string, code?: string) {
  const body: ApiError = { error };
  if (code) body.code = code;
  return c.json(body, status as never);
}

export function notFound(c: Context, resource = "Resource") {
  return errorResponse(c, 404, `${resource} not found`, "NOT_FOUND");
}

export function forbidden(c: Context, message = "Forbidden") {
  return errorResponse(c, 403, message, "FORBIDDEN");
}

export function unauthorized(c: Context, message = "Unauthorized") {
  return errorResponse(c, 401, message, "UNAUTHORIZED");
}

export function badRequest(c: Context, message: string) {
  return errorResponse(c, 400, message, "BAD_REQUEST");
}

export function conflict(c: Context, message: string) {
  return errorResponse(c, 409, message, "CONFLICT");
}
