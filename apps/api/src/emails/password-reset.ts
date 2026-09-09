export function passwordResetEmail(
  to: string,
  resetLink: string,
): {
  to: string;
  subject: string;
  text: string;
  html: string;
} {
  return {
    to,
    subject: "SigilPanel - Password Reset",
    text: `You requested a password reset for your SigilPanel account.\n\nClick the link below to reset your password:\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`,
    html: `
      <h1>SigilPanel Password Reset</h1>
      <p>You requested a password reset for your SigilPanel account.</p>
      <p><a href="${resetLink}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you did not request this, ignore this email.</p>
    `,
  };
}
