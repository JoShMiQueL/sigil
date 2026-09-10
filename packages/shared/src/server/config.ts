import { z } from "zod";

export const PortMappingSchema = z.object({
  hostIp: z.string().optional(),
  hostPort: z.number().int().min(1).max(65535),
  containerPort: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});
export type PortMapping = z.infer<typeof PortMappingSchema>;

export const ResourceLimitsSchema = z.object({
  memoryMb: z.number().int().min(1).max(16384),
  cpuLimit: z.number().min(0.1).max(16),
  pidsLimit: z.number().int().min(16).max(4096).optional(),
});
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

export const ServerConfigurationSchema = z.object({
  serverId: z.string().uuid(),
  image: z.string().min(1),
  startupCommand: z.string().min(1),
  environment: z.record(z.string(), z.string()).default({}),
  portMappings: z.array(PortMappingSchema).default([]),
  resourceLimits: ResourceLimitsSchema,
  volumePath: z.string().min(1),
});
export type ServerConfiguration = z.infer<typeof ServerConfigurationSchema>;
