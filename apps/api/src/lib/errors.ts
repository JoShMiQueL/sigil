import type { Context } from "hono";

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errorResponse(c: Context<any>, status: number, error: string, code?: string) {
  const body: ApiError = { error };
  if (code) body.code = code;
  return c.json(body, status as never);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notFound(c: Context<any>, resource = "Resource") {
  return errorResponse(c, 404, `${resource} not found`, "NOT_FOUND");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function forbidden(c: Context<any>, message = "Forbidden") {
  return errorResponse(c, 403, message, "FORBIDDEN");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unauthorized(c: Context<any>, message = "Unauthorized") {
  return errorResponse(c, 401, message, "UNAUTHORIZED");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function badRequest(c: Context<any>, message: string) {
  return errorResponse(c, 400, message, "BAD_REQUEST");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function conflict(c: Context<any>, message: string) {
  return errorResponse(c, 409, message, "CONFLICT");
}
