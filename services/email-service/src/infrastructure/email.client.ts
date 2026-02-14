import nodemailer from "nodemailer";
import type { NoReplySecret } from "../types";

export async function createTransporter(secret: NoReplySecret) {
  return nodemailer.createTransport({
    host: secret.service,
    port: 587,
    secure: false,
    auth: {
      user: secret.user,
      pass: secret.password,
    },
  });
}

export interface SendMailOptions {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export async function sendMail(
  secret: NoReplySecret,
  options: SendMailOptions
): Promise<void> {
  const transporter = await createTransporter(secret);
  await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html ?? undefined,
    text: options.text ?? options.html ?? undefined,
  });
}
