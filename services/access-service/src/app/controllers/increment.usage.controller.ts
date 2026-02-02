import { RequestContext } from "../../handler/api-gateway/types";
import { IncrementUsageUseCase } from "@libs/domain";
import { AuthenticationError } from "@libs/domain";

export class IncrementUsageController {
  constructor(private readonly useCase: IncrementUsageUseCase) {}

  handle = async (req: RequestContext) => {
    const userId = req.user?.id;
    const key = req.pathParams.key;

    if (!userId) {
      throw new AuthenticationError("Authorization required");
    }
    if (!key) {
      const err = new Error("Entitlement key is required");
      (err as any).name = "ValidationError";
      throw err;
    }

    const amount = req.body?.amount != null ? Number(req.body.amount) : 1;
    if (!Number.isInteger(amount) || amount < 1) {
      const err = new Error("amount must be a positive integer");
      (err as any).name = "ValidationError";
      throw err;
    }

    return await this.useCase.execute({ userId, key, amount });
  };
}
