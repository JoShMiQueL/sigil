import { z } from "zod";
import {
  AllocationCreatePayloadSchema,
  AllocationDeletePayloadSchema,
  AllocationSchema,
} from "../allocation/allocation";
import { UserSchema } from "../auth/user";
import { NodeSchema } from "../node/node";
import { RegionWithCountsSchema } from "../node/region";
import { ServerLifecycleStatusEnum } from "../server/record";
import { ChangeSchema } from "../template/changelog";
import { TemplateSchema } from "../template/template";

export const SSEEventTypeSchema = z.enum([
  "node.update",
  "node.create",
  "node.delete",
  "region.update",
  "server.state",
  "server.create",
  "server.update",
  "server.delete",
  "user.update",
  "connected",
  "template.create",
  "template.update",
  "template.delete",
  "template.update_available",
  "template.update_applied",
  "registry.update",
  "allocation.create",
  "allocation.update",
  "allocation.delete",
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

export const ServerStatePayloadSchema = z.object({
  serverId: z.string().uuid(),
  nodeId: z.string().uuid(),
  state: z.enum(["creating", "running", "stopped", "crashed", "removing", "missing"]),
  reason: z.string().optional(),
  exitCode: z.number().int().nullable().optional(),
  timestamp: z.string().datetime(),
});
export type ServerStatePayload = z.infer<typeof ServerStatePayloadSchema>;

export const ServerCreatePayloadSchema = z.object({
  serverId: z.string().uuid(),
  nodeId: z.string().uuid(),
  name: z.string(),
  status: ServerLifecycleStatusEnum,
});
export type ServerCreatePayload = z.infer<typeof ServerCreatePayloadSchema>;

export const ServerUpdatePayloadSchema = z.object({
  serverId: z.string().uuid(),
  nodeId: z.string().uuid(),
  status: ServerLifecycleStatusEnum,
  previousStatus: ServerLifecycleStatusEnum,
});
export type ServerUpdatePayload = z.infer<typeof ServerUpdatePayloadSchema>;

export const ServerDeletePayloadSchema = z.object({
  serverId: z.string().uuid(),
  nodeId: z.string().uuid(),
  deleted: z.literal(true),
});
export type ServerDeletePayload = z.infer<typeof ServerDeletePayloadSchema>;

export const ConnectedPayloadSchema = z.object({
  connectionId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type ConnectedPayload = z.infer<typeof ConnectedPayloadSchema>;

export const TemplateDeletePayloadSchema = z.object({
  id: z.string().uuid(),
  deleted: z.literal(true),
});
export type TemplateDeletePayload = z.infer<typeof TemplateDeletePayloadSchema>;

export const TemplateUpdateAvailablePayloadSchema = z.object({
  templateId: z.string().uuid(),
  templateName: z.string(),
  registryName: z.string(),
  sourceId: z.string(),
  oldVersion: z.string(),
  newVersion: z.string(),
  changes: z.array(ChangeSchema),
  customized: z.boolean(),
});
export type TemplateUpdateAvailablePayload = z.infer<typeof TemplateUpdateAvailablePayloadSchema>;

export const TemplateUpdateAppliedPayloadSchema = z.object({
  templateId: z.string().uuid(),
  templateName: z.string(),
  newVersion: z.string(),
});
export type TemplateUpdateAppliedPayload = z.infer<typeof TemplateUpdateAppliedPayloadSchema>;

export const SSEEventPayloadSchema = z.union([
  NodeSchema,
  NodeDeletePayloadSchema,
  RegionWithCountsSchema,
  RegionDeletePayloadSchema,
  UserSchema,
  UserDeletePayloadSchema,
  ServerStatePayloadSchema,
  ServerCreatePayloadSchema,
  ServerUpdatePayloadSchema,
  ServerDeletePayloadSchema,
  ConnectedPayloadSchema,
  TemplateSchema,
  TemplateDeletePayloadSchema,
  TemplateUpdateAvailablePayloadSchema,
  TemplateUpdateAppliedPayloadSchema,
  AllocationSchema,
  AllocationCreatePayloadSchema,
  AllocationDeletePayloadSchema,
]);
export type SSEEventPayload = z.infer<typeof SSEEventPayloadSchema>;

export const SSEEventSchema = z.object({
  type: SSEEventTypeSchema,
  payload: SSEEventPayloadSchema,
  timestamp: z.string().datetime(),
});
export type SSEEvent = z.infer<typeof SSEEventSchema>;
