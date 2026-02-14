/**
 * Queue message: one email to send.
 */
export interface EmailQueueMessage {
  /** Template filename (e.g. "welcome.hbs") in S3; if omitted, use content.message as plain body */
  template?: string;
  /** Email subject / header */
  header: string;
  /** Recipient email address */
  to: string;
  /** Data to inject into the template (or { message } for no-template) */
  content: Record<string, unknown>;
}

export interface NoReplySecret {
  user: string;
  password: string;
  service: string;
  /** From address (defaults to user if not set) */
  from?: string;
}
