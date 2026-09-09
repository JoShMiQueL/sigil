import { z } from "zod";

export const TotpEnableResponseSchema = z.object({
  secret: z.string(),
  qrUri: z.string(),
  recoveryCodes: z.array(z.string()),
});
export type TotpEnableResponse = z.infer<typeof TotpEnableResponseSchema>;

export const TotpVerifySchema = z.object({
  userId: z.string().uuid(),
  code: z.string().min(1),
});
export type TotpVerify = z.infer<typeof TotpVerifySchema>;

export const TotpEnableVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export type TotpEnableVerify = z.infer<typeof TotpEnableVerifySchema>;

export const TotpDisableSchema = z.object({
  password: z.string().min(1),
});
export type TotpDisable = z.infer<typeof TotpDisableSchema>;
