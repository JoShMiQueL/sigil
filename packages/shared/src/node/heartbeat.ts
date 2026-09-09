import { z } from "zod";

export const HeartbeatPayloadSchema = z.object({
  timestamp: z.number().int(),
  cpuUsage: z.number().min(0).max(100),
  memoryUsage: z.number().min(0).max(100),
  diskUsage: z.number().min(0).max(100),
  containerCount: z.number().int().min(0),
});
export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>;
