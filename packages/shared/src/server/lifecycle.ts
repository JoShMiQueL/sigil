import { z } from "zod";
import { ServerConfigurationSchema } from "./config";
import { ContainerStateSchema } from "./state";

export const CreateServerRequestSchema = ServerConfigurationSchema;
export type CreateServerRequest = z.infer<typeof CreateServerRequestSchema>;

export const LifecycleResponseSchema = z.object({
  serverId: z.string().uuid(),
  state: ContainerStateSchema,
  message: z.string().optional(),
});
export type LifecycleResponse = z.infer<typeof LifecycleResponseSchema>;

export const ServerStatusSchema = z.object({
  serverId: z.string().uuid(),
  state: ContainerStateSchema,
  containerId: z.string().nullable(),
  exitCode: z.number().int().nullable().optional(),
  uptime: z.number().int().optional(),
});
export type ServerStatus = z.infer<typeof ServerStatusSchema>;
