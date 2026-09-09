import { z } from "zod";

export const NodeStatusSchema = z.enum(["online", "offline", "unknown"]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const NodeCapabilitiesSchema = z
  .object({
    docker: z.boolean().optional(),
    sftp: z.boolean().optional(),
  })
  .passthrough();
export type NodeCapabilities = z.infer<typeof NodeCapabilitiesSchema>;

export const NodeSchema = z.object({
  id: z.string().uuid(),
  regionId: z.string().uuid(),
  regionName: z.string(),
  hostname: z.string().max(255),
  displayName: z.string().max(64),
  ipAddress: z.string(),
  capabilities: NodeCapabilitiesSchema,
  status: NodeStatusSchema,
  cpuUsage: z.number().nullable(),
  memoryUsage: z.number().nullable(),
  diskUsage: z.number().nullable(),
  containerCount: z.number().nullable(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Node = z.infer<typeof NodeSchema>;

export const NodeUpdateSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  regionId: z.string().uuid().optional(),
});
export type NodeUpdate = z.infer<typeof NodeUpdateSchema>;
