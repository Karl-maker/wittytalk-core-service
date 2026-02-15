import type { RequestContext } from "../handler/api-gateway/types";
import type { UnsubscribesRepository } from "../infrastructure/dynamodb.client";
import type { UserClient } from "../infrastructure/user.client";

export class UnsubscribeController {
  constructor(
    private readonly unsubscribesRepo: UnsubscribesRepository,
    private readonly userClient: UserClient | null
  ) {}

  async handle(req: RequestContext): Promise<{ ok: boolean; message: string }> {
    let email: string | undefined;
    let userId: string | undefined;

    if (req.method === "GET") {
      email = req.query?.email ?? req.query?.e;
      userId = req.query?.userId ?? req.query?.uid;
    } else {
      const body = req.body ?? {};
      email =
        typeof body.email === "string"
          ? body.email
          : typeof body.e === "string"
            ? body.e
            : undefined;
      userId =
        typeof body.userId === "string"
          ? body.userId
          : typeof body.uid === "string"
            ? body.uid
            : undefined;
    }

    if (userId?.trim() && this.userClient) {
      const user = await this.userClient.getProfileByUserId(userId.trim());
      if (user?.email?.trim()) {
        email = user.email.trim();
      }
    }

    if (!email?.trim()) {
      return {
        ok: false,
        message:
          "Missing email or userId (query: email/e or userId/uid; body: email/e or userId/uid). When using userId we look up the user's email.",
      };
    }

    await this.unsubscribesRepo.unsubscribe(email);
    return { ok: true, message: "You have been unsubscribed." };
  }
}
