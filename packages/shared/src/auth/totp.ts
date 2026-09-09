import { z } from "zod";

export const TotpEnableSchema = z.object({
  secret: z.string(),
  qrUri: z.string(),
  recoveryCodes: z.array(z.string()),
});
export type TotpEnable = z.infer<typeof TotpEnableSchema>;

export const TotpVerifySchema = z.object({
  challenge: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});
export type TotpVerify = z.infer<typeof TotpVerifySchema>;

export const TotpDisableSchema = z.object({
  password: z.string().min(1),
});
export type TotpDisable = z.infer<typeof TotpDisableSchema>;
