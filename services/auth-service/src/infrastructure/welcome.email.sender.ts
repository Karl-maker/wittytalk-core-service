import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

/**
 * Message shape expected by email-service queue (see email-service README).
 */
export interface WelcomeEmailMessage {
  template: string;
  header: string;
  to: string;
  content: Record<string, unknown>;
}

/**
 * Sends the welcome email payload to the email-service SQS queue.
 * No-op if EMAIL_QUEUE_URL is not set (e.g. in dev).
 */
export class WelcomeEmailSender {
  private readonly queueUrl: string | undefined;
  private readonly client: SQSClient;

  constructor() {
    this.queueUrl = process.env.EMAIL_QUEUE_URL;
    this.client = new SQSClient({});
  }

  async sendWelcomeEmail(userId: string): Promise<void> {
    if (!this.queueUrl) {
      console.log("EMAIL_QUEUE_URL not set, skipping welcome email");
      return;
    }

    const body: WelcomeEmailMessage = {
      template: "welcome.hbs",
      header: "Welcome To WittyTalk",
      to: userId,
      content: { userId },
    };

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(body),
        })
      );
      console.log(`Enqueued welcome email for user ${userId}`);
    } catch (error) {
      console.error(`Failed to enqueue welcome email for ${userId}:`, error);
      // Don't throw - email failure shouldn't fail signup
    }
  }
}
