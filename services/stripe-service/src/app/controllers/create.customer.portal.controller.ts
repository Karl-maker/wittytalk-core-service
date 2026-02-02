import { RequestContext } from "../../handler/api-gateway/types";
import { StripeClient } from "../../infrastructure/stripe.client";
import { StripeCustomerRepository } from "../../infrastructure/stripe-customer.repository";
import { AuthenticationError } from "@libs/domain";

export class CreateCustomerPortalController {
  constructor(
    private readonly stripeClient: StripeClient,
    private readonly customerRepo: StripeCustomerRepository
  ) {}

  handle = async (req: RequestContext & { user?: { id: string } }) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AuthenticationError("Authorization required");
    }

    const returnUrl = (req.body?.returnUrl ?? req.query?.returnUrl) as string | undefined;
    if (!returnUrl || typeof returnUrl !== "string") {
      const err = new Error("returnUrl is required (body or query)");
      (err as any).name = "ValidationError";
      throw err;
    }

    const customer = await this.customerRepo.findByUserId(userId);
    if (!customer) {
      const err = new Error("No billing account found. Complete a purchase first to manage billing.");
      (err as any).name = "NotFoundError";
      throw err;
    }

    const session = await this.stripeClient.createPortalSession({
      customerId: customer.stripeCustomerId,
      returnUrl,
    });

    return {
      url: session.url,
    };
  };
}
