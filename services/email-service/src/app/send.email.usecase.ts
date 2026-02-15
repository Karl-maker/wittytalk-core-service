import { randomUUID } from "crypto";
import { sendMail } from "../infrastructure/email.client";
import { getNoReplySecret } from "../infrastructure/secrets.client";
import { TemplateService } from "../infrastructure/template.service";
import type { EmailQueueMessage, NoReplySecret } from "../types";
import { EmailsSentRepository } from "../infrastructure/dynamodb.client";
import { UnsubscribesRepository } from "../infrastructure/dynamodb.client";

/**
 * Injects default template variables (year, name, email) so every template has them.
 * Incoming SQS message content overrides these when it provides year, name, or email.
 */
function injectTemplateDefaults(
  to: string,
  content: Record<string, unknown>
): Record<string, unknown> {
  const year = String(new Date().getFullYear());
  const localPart = to.includes("@") ? to.split("@")[0].trim() : "";
  const name =
    localPart.length > 0
      ? localPart.charAt(0).toUpperCase() + localPart.slice(1).toLowerCase()
      : undefined;
  return {
    year,
    name,
    email: to,
    ...content,
  };
}

export class SendEmailUseCase {
  constructor(
    private readonly templateService: TemplateService,
    private readonly emailsSentRepo: EmailsSentRepository,
    private readonly unsubscribesRepo: UnsubscribesRepository,
    private readonly noReplySecretName: string
  ) {}

  async execute(
    message: EmailQueueMessage,
    _messageId: string
  ): Promise<{ success: boolean; error?: string }> {
    const to = message.to?.trim();
    if (!to) {
      return { success: false, error: "Missing 'to'" };
    }

    const isUnsubscribed = await this.unsubscribesRepo.isUnsubscribed(to);
    if (isUnsubscribed) {
      console.log(`Skipping email to unsubscribed address: ${to}`);
      return { success: true };
    }

    let secret: NoReplySecret;
    try {
      secret = await getNoReplySecret(this.noReplySecretName);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return { success: false, error: `Secrets: ${err}` };
    }

    const fromAddress = secret.from ?? secret.user;

    let html: string | undefined;
    const text = !message.template && typeof message.content?.message === "string"
      ? message.content.message
      : undefined;

    if (message.template) {
      try {
        const content = injectTemplateDefaults(to, message.content ?? {});
        html = await this.templateService.render(message.template, content);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return { success: false, error: `Template: ${err}` };
      }
    } else if (typeof message.content?.message === "string") {
      html = message.content.message;
    } else {
      return { success: false, error: "Missing template or content.message" };
    }

    try {
      await sendMail(secret, {
        from: fromAddress,
        to,
        subject: message.header ?? "(No subject)",
        html: html || undefined,
        text: text || html,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return { success: false, error: `Send: ${err}` };
    }

    const recordId = randomUUID();
    await this.emailsSentRepo.record({
      id: recordId,
      to,
      template: message.template ?? undefined,
      header: message.header ?? "",
      sentAt: new Date().toISOString(),
    });

    return { success: true };
  }
}
