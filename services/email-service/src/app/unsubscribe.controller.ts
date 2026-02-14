import type { RequestContext } from "../handler/api-gateway/types";
import type { UnsubscribesRepository } from "../infrastructure/dynamodb.client";

export class UnsubscribeController {
  constructor(private readonly unsubscribesRepo: UnsubscribesRepository) {}

  async handle(req: RequestContext): Promise<{ ok: boolean; message: string }> {
    let email: string | undefined;

    if (req.method === "GET") {
      email = req.query?.email ?? req.query?.e;
    } else {
      const body = req.body ?? {};
      email =
        typeof body.email === "string"
          ? body.email
          : typeof body.e === "string"
            ? body.e
            : undefined;
    }

    if (!email?.trim()) {
      return { ok: false, message: "Missing email (query param 'email' or body.email)" };
    }

    await this.unsubscribesRepo.unsubscribe(email);
    return { ok: true, message: "You have been unsubscribed." };
  }
}
