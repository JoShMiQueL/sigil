import { z } from "zod";
import { UserSchema } from "../auth/user";
import { NodeSchema } from "../node/node";
import { RegionWithCountsSchema } from "../node/region";

export const SSEEventTypeSchema = z.enum([
  "node.update",
  "node.create",
  "node.delete",
  "region.update",
  "user.update",
  "connected",
]);
export type SSEEventType = z.infer<typeof SSEEventTypeSchema>;

export const NodeDeletePayloadSchema = z.object({
  id: z.string().uuid(),
});
export type NodeDeletePayload = z.infer<typeof NodeDeletePayloadSchema>;

export const RegionDeletePayloadSchema = z.object({
  id: z.string().uuid(),
  deleted: z.literal(true),
});
export type RegionDeletePayload = z.infer<typeof RegionDeletePayloadSchema>;

export const UserDeletePayloadSchema = z.object({
  id: z.string().uuid(),
  deleted: z.literal(true),
});
export type UserDeletePayload = z.infer<typeof UserDeletePayloadSchema>;

export const ConnectedPayloadSchema = z.object({
  connectionId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type ConnectedPayload = z.infer<typeof ConnectedPayloadSchema>;

export const SSEEventPayloadSchema = z.union([
  NodeSchema,
  NodeDeletePayloadSchema,
  RegionWithCountsSchema,
  RegionDeletePayloadSchema,
  UserSchema,
  UserDeletePayloadSchema,
  ConnectedPayloadSchema,
]);
export type SSEEventPayload = z.infer<typeof SSEEventPayloadSchema>;

export const SSEEventSchema = z.object({
  type: SSEEventTypeSchema,
  payload: SSEEventPayloadSchema,
  timestamp: z.string().datetime(),
});
export type SSEEvent = z.infer<typeof SSEEventSchema>;
