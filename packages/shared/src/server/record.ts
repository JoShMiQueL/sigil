import { z } from "zod";
import { ServerConfigurationSchema } from "./config";

export const ServerLifecycleStatusEnum = z.enum([
  "offline",
  "starting",
  "running",
  "stopping",
  "stopped",
  "crashed",
  "creation_failed",
]);
export type ServerLifecycleStatus = z.infer<typeof ServerLifecycleStatusEnum>;

export const ServerRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  nodeId: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  allocationId: z.string().uuid().nullable(),
  status: ServerLifecycleStatusEnum,
  config: ServerConfigurationSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ServerRecord = z.infer<typeof ServerRecordSchema>;

export const ServerCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  nodeId: z.string().uuid(),
  templateId: z.string().uuid(),
  variables: z.record(z.string(), z.string()).default({}),
});
export type ServerCreateInput = z.infer<typeof ServerCreateInputSchema>;

export const ServerListResponseSchema = z.object({
  servers: z.array(ServerRecordSchema),
  total: z.number().int(),
});
export type ServerListResponse = z.infer<typeof ServerListResponseSchema>;

export const ServerPowerActionSchema = z.enum(["start", "stop", "restart"]);
export type ServerPowerAction = z.infer<typeof ServerPowerActionSchema>;
