import { z } from "zod";

export const NodeCredentialSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string().uuid(),
  secretId: z.string(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});
export type NodeCredential = z.infer<typeof NodeCredentialSchema>;

export const NodeCredentialDisplaySchema = z.object({
  nodeId: z.string().uuid(),
  secretId: z.string(),
  secret: z.string(),
  createdAt: z.string().datetime(),
});
export type NodeCredentialDisplay = z.infer<typeof NodeCredentialDisplaySchema>;

export const NodeAuthHeadersSchema = z.object({
  "x-node-id": z.string().min(1),
  "x-node-signature": z.string().min(1),
  "x-node-timestamp": z.string().min(1),
});
export type NodeAuthHeaders = z.infer<typeof NodeAuthHeadersSchema>;
