import { z } from "zod";
import { PermissionsSchema } from "./permissions";

// Member role on a server
export const MemberRoleSchema = z.enum(["owner", "member"]);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

// A server member record (as returned by the API)
export const MemberSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string().uuid(),
  userId: z.string().uuid(),
  username: z.string(),
  email: z.string(),
  role: MemberRoleSchema,
  permissions: PermissionsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

// Response for listing members
export const MemberListResponseSchema = z.object({
  members: z.array(MemberSchema),
  total: z.number().int().min(0),
});
export type MemberListResponse = z.infer<typeof MemberListResponseSchema>;

// Input for adding a member
export const AddMemberInputSchema = z.object({
  email: z.string().email(),
  permissions: PermissionsSchema,
});
export type AddMemberInput = z.infer<typeof AddMemberInputSchema>;

// Input for updating a member's permissions
export const UpdateMemberPermissionsInputSchema = z.object({
  permissions: PermissionsSchema,
});
export type UpdateMemberPermissionsInput = z.infer<typeof UpdateMemberPermissionsInputSchema>;

// Input for transferring ownership
export const TransferOwnershipInputSchema = z.object({
  newOwnerId: z.string().uuid(),
});
export type TransferOwnershipInput = z.infer<typeof TransferOwnershipInputSchema>;
