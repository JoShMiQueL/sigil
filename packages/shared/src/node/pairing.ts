import { z } from "zod";

export const PairingTokenSchema = z.object({
  id: z.string().uuid(),
  regionId: z.string().uuid(),
  regionName: z.string(),
  createdBy: z.string().uuid(),
  expiresAt: z.string().datetime(),
  usedAt: z.string().datetime().nullable(),
  usedByNodeId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type PairingToken = z.infer<typeof PairingTokenSchema>;

export const PairingTokenCreateSchema = z.object({
  regionId: z.string().uuid(),
});
export type PairingTokenCreate = z.infer<typeof PairingTokenCreateSchema>;

export const PairingTokenDisplaySchema = z.object({
  id: z.string().uuid(),
  token: z.string(),
  regionId: z.string().uuid(),
  regionName: z.string(),
  expiresAt: z.string().datetime(),
});
export type PairingTokenDisplay = z.infer<typeof PairingTokenDisplaySchema>;

export const PairingRequestSchema = z.object({
  pairingToken: z.string().min(1),
  hostname: z.string().min(1).max(255),
  ipAddress: z.string().min(1),
  capabilities: z
    .object({
      docker: z.boolean().optional(),
      sftp: z.boolean().optional(),
    })
    .passthrough(),
});
export type PairingRequest = z.infer<typeof PairingRequestSchema>;

export const NodeRegistrationResponseSchema = z.object({
  nodeId: z.string().uuid(),
  secretId: z.string(),
  secret: z.string(),
});
export type NodeRegistrationResponse = z.infer<typeof NodeRegistrationResponseSchema>;
