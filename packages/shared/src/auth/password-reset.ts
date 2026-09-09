import { z } from "zod";

export const PasswordResetRequestSchema = z.object({
  email: z
    .string()
    .email()
    .max(255)
    .transform((v) => v.toLowerCase()),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

export const PasswordResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
export type PasswordReset = z.infer<typeof PasswordResetSchema>;
