import { z } from "zod";

// JWT payload for console access (signed by panel API, validated by daemon)
export const ConsoleTokenPayloadSchema = z.object({
  serverId: z.string().uuid(),
  userId: z.string().uuid(),
  scope: z.literal("console"),
  iat: z.number().int(),
  exp: z.number().int(),
});
export type ConsoleTokenPayload = z.infer<typeof ConsoleTokenPayloadSchema>;

// Response from POST /api/admin/servers/:serverId/console-token
export const ConsoleTokenResponseSchema = z.object({
  token: z.string(),
  daemonUrl: z.string(),
  serverId: z.string().uuid(),
  expiresIn: z.number().int(),
});
export type ConsoleTokenResponse = z.infer<typeof ConsoleTokenResponseSchema>;
