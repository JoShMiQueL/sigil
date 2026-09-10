import { z } from "zod";

export const ContainerStateSchema = z.enum([
  "creating",
  "running",
  "stopped",
  "crashed",
  "removing",
  "missing",
]);
export type ContainerState = z.infer<typeof ContainerStateSchema>;

export const StateChangeEventSchema = z.object({
  serverId: z.string().uuid(),
  nodeId: z.string().uuid(),
  previousState: ContainerStateSchema,
  newState: ContainerStateSchema,
  reason: z.string().optional(),
  exitCode: z.number().int().nullable().optional(),
  timestamp: z.number().int(),
});
export type StateChangeEvent = z.infer<typeof StateChangeEventSchema>;
