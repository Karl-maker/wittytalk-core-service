import { randomUUID } from "crypto";
import { sendMail } from "../infrastructure/email.client";
import { getNoReplySecret } from "../infrastructure/secrets.client";
import { TemplateService } from "../infrastructure/template.service";
import type { EmailQueueMessage, NoReplySecret } from "../types";
import { EmailsSentRepository } from "../infrastructure/dynamodb.client";
import { UnsubscribesRepository } from "../infrastructure/dynamodb.client";
import { type UserProfile, UserClient } from "../infrastructure/user.client";

/**
 * Injects default template variables (year, name, email, profileImageUrl).
 * recipientEmail: the resolved recipient email (used for footer "sent to", etc.).
 * Name: content.name > fetchedUser.name (from DB) > content.user.name > derived from email.
 * profileImageUrl: content.profileImageUrl > fetchedUser.profileImageUrl (from DB) > content.user.profileImageUrl.
 */
function injectTemplateDefaults(
  recipientEmail: string,
  content: Record<string, unknown>,
  fetchedUser: UserProfile | null
): Record<string, unknown> {
  const year = String(new Date().getFullYear());
  const localPart = recipientEmail.includes("@") ? recipientEmail.split("@")[0].trim() : "";
  const derivedName =
    localPart.length > 0
      ? localPart.charAt(0).toUpperCase() + localPart.slice(1).toLowerCase()
      : undefined;
  const user = content?.user && typeof content.user === "object" ? (content.user as Record<string, unknown>) : null;
  const resolvedName =
    content.name != null ? content.name
    : fetchedUser?.name != null ? fetchedUser.name
    : user?.name != null ? String(user.name)
    : derivedName;
  const resolvedProfileImageUrl =
    content.profileImageUrl != null ? content.profileImageUrl
    : fetchedUser?.profileImageUrl != null ? fetchedUser.profileImageUrl
    : user?.profileImageUrl != null ? String(user.profileImageUrl)
    : undefined;
  return {
    year,
    email: recipientEmail,
    ...content,
    name: resolvedName,
    profileImageUrl: resolvedProfileImageUrl,
  };
}

export class SendEmailUseCase {
  constructor(
    private readonly templateService: TemplateService,
    private readonly emailsSentRepo: EmailsSentRepository,
    private readonly unsubscribesRepo: UnsubscribesRepository,
    private readonly noReplySecretName: string,
    private readonly userClient: UserClient | null
  ) {}

  async execute(
    message: EmailQueueMessage,
    _messageId: string
  ): Promise<{ success: boolean; error?: string }> {
    const to = message.to?.trim();
    if (!to) {
      return { success: false, error: "Missing 'to'" };
    }

    // If "to" does not look like an email, treat it as userId and resolve to email
    const looksLikeEmail = to.includes("@");
    let resolvedToEmail: string = to;
    let userFromTo: UserProfile | null = null;
    if (!looksLikeEmail && this.userClient) {
      userFromTo = await this.userClient.getProfileByUserId(to);
      if (userFromTo?.email?.trim()) {
        resolvedToEmail = userFromTo.email.trim();
      } else {
        return { success: false, error: `Could not resolve userId "${to}" to an email (user not found or has no email)` };
      }
    }

    const isUnsubscribed = await this.unsubscribesRepo.isUnsubscribed(resolvedToEmail);
    if (isUnsubscribed) {
      console.log(`Skipping email to unsubscribed address: ${resolvedToEmail}`);
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
        const rawContent = message.content ?? {};
        let fetchedUser: UserProfile | null = null;
        const contentUserId = rawContent.userId != null ? String(rawContent.userId).trim() : "";
        if (contentUserId && this.userClient) {
          fetchedUser = await this.userClient.getProfileByUserId(contentUserId);
        } else if (userFromTo) {
          fetchedUser = userFromTo;
        }
        const content = injectTemplateDefaults(resolvedToEmail, rawContent, fetchedUser);
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
        to: resolvedToEmail,
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
      to: resolvedToEmail,
      template: message.template ?? undefined,
      header: message.header ?? "",
      sentAt: new Date().toISOString(),
    });

    return { success: true };
  }
}
