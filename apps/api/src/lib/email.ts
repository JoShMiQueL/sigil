import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
});

export async function sendEmail(msg: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (process.env.SMTP_ENABLED !== "true") {
    console.log(`[email] SMTP disabled, would send to ${msg.to}: ${msg.subject}`);
    console.log(`[email] Body: ${msg.text}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "noreply@sigilpanel.local",
    ...msg,
  });
}
