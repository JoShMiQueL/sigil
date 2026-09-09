import { authenticator } from "@otplib/preset-default";

// Configure TOTP to match standard authenticator apps
authenticator.options = {
  step: 30, // 30-second window
  window: 1, // Allow 1 step drift (±30 seconds)
  digits: 6,
};

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function generateTotpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "SigilPanel", secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}
