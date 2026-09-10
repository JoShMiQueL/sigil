import { z } from "zod";

export const ProtocolSchema = z.enum(["tcp", "udp"]);
export type Protocol = z.infer<typeof ProtocolSchema>;

export const AllocationStatusSchema = z.enum(["available", "assigned"]);
export type AllocationStatus = z.infer<typeof AllocationStatusSchema>;

function isValidIp(value: string): boolean {
  // IPv4: four octets 0-255
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4.test(value)) {
    const octets = value.split(".").map(Number);
    return octets.every((o) => o >= 0 && o <= 255);
  }
  // IPv6: must contain ":" and have valid hex groups
  if (value.includes(":")) {
    // Strip zone id if present (e.g., fe80::1%eth0)
    const addr = value.split("%")[0];
    // Reject if it looks like a port-only string
    if (!addr.includes(":")) return false;
    // Expand and validate: split on ":" and check each group is valid hex 1-4 chars
    // Allow "::" shorthand (max one occurrence)
    const parts = addr.split(":");
    if (parts.length < 3 || parts.length > 8) return false;
    const doubleColon = parts.filter((p) => p === "").length;
    if (doubleColon > 1) return false;
    if (doubleColon === 0 && parts.length !== 8) return false;
    for (const part of parts) {
      if (part === "") continue; // empty from :: shorthand
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return false;
    }
    return true;
  }
  return false;
}

export const IpAddressSchema = z.string().refine(isValidIp, "Invalid IPv4 or IPv6 address");
export type IpAddress = z.infer<typeof IpAddressSchema>;

export const AllocationSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string().uuid(),
  ip: z.string(),
  port: z.number().int().min(1).max(65535),
  protocol: ProtocolSchema,
  status: AllocationStatusSchema,
  serverId: z.string().uuid().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Allocation = z.infer<typeof AllocationSchema>;

export const AllocationCreateSchema = z
  .object({
    ip: IpAddressSchema,
    portStart: z.number().int().min(1).max(65535),
    portEnd: z.number().int().min(1).max(65535).optional(),
    protocol: ProtocolSchema.default("tcp"),
  })
  .refine((d) => d.portEnd === undefined || d.portEnd >= d.portStart, {
    message: "portEnd must be greater than or equal to portStart",
    path: ["portEnd"],
  });
export type AllocationCreate = z.infer<typeof AllocationCreateSchema>;

export const AllocationCreateResultSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  ip: z.string(),
  portRange: z.string(),
});
export type AllocationCreateResult = z.infer<typeof AllocationCreateResultSchema>;

export const AllocationAssignSchema = z.object({
  serverId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});
export type AllocationAssign = z.infer<typeof AllocationAssignSchema>;

export const AllocationAutoAssignSchema = z.object({
  serverId: z.string().uuid(),
});
export type AllocationAutoAssign = z.infer<typeof AllocationAutoAssignSchema>;

export const AllocationListResponseSchema = z.object({
  allocations: z.array(AllocationSchema),
  total: z.number().int(),
  available: z.number().int(),
  assigned: z.number().int(),
});
export type AllocationListResponse = z.infer<typeof AllocationListResponseSchema>;

export const AllocationSummarySchema = z.object({
  total: z.number().int(),
  available: z.number().int(),
  assigned: z.number().int(),
  primaryIp: z.string().nullable(),
});
export type AllocationSummary = z.infer<typeof AllocationSummarySchema>;

export const AllocationReleaseSchema = z.object({
  serverId: z.string().uuid(),
});
export type AllocationRelease = z.infer<typeof AllocationReleaseSchema>;

export const AllocationReleaseResultSchema = z.object({
  released: z.number().int(),
});
export type AllocationReleaseResult = z.infer<typeof AllocationReleaseResultSchema>;

// SSE payload schemas
export const AllocationCreatePayloadSchema = z.object({
  nodeId: z.string().uuid(),
  ip: z.string(),
  count: z.number().int(),
  portRange: z.string(),
});
export type AllocationCreatePayload = z.infer<typeof AllocationCreatePayloadSchema>;

export const AllocationDeletePayloadSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string().uuid(),
  deleted: z.literal(true),
});
export type AllocationDeletePayload = z.infer<typeof AllocationDeletePayloadSchema>;
