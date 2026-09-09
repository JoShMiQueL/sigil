import { z } from "zod";
import { UserSchema } from "./user";

export const LoginRequestSchema = z.object({
  email: z
    .string()
    .email()
    .max(255)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    user: UserSchema,
  }),
  z.object({
    status: z.literal("2fa_required"),
    challenge: z.string().uuid(),
  }),
]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
