import { EntitlementRepository } from "../ports/entitlement.repository";
import { NotFoundError } from "../../domain/errors/not-found.error";
import { DomainError } from "../../domain/errors/domain.error";

export interface IncrementUsageInput {
  userId: string;
  key: string;
  amount?: number; // Default 1
}

export interface IncrementUsageResult {
  key: string;
  usage: number; // Current usage (consumed)
  limit: number; // Effective limit (base + permanent)
  remaining: number; // How much is left: limit - usage
}

export class IncrementUsageUseCase {
  constructor(private readonly repo: EntitlementRepository) {}

  async execute(input: IncrementUsageInput): Promise<IncrementUsageResult> {
    const { userId, key, amount = 1 } = input;

    const entitlement = await this.repo.findByUserAndKey(userId, key);
    if (!entitlement) {
      throw new NotFoundError(`Entitlement '${key}' not found for user '${userId}'`);
    }
    if (!entitlement.isActive()) {
      throw new NotFoundError(`Entitlement '${key}' is not active for user '${userId}'`);
    }
    if (!entitlement.usage) {
      throw new DomainError(`Entitlement '${key}' is not usage-based`);
    }

    // Lazy evaluation: reset usage if period has passed
    if (entitlement.usage.shouldReset()) {
      entitlement.usage.reset();
      await this.repo.update(entitlement);
      console.log(`Reset usage for entitlement ${key} (user: ${userId}) due to reset period`);
      // Re-fetch so we consume against fresh usage
      const updated = await this.repo.findByUserAndKey(userId, key);
      if (!updated?.usage) {
        throw new DomainError(`Entitlement '${key}' is not usage-based`);
      }
      const limit = updated.usage.getEffectiveLimit();
      if (updated.usage.canConsume(amount)) {
        updated.usage.consume(amount);
      } else {
        // Cap at limit instead of throwing; do not stop early
        updated.usage.used = limit;
      }
      await this.repo.update(updated);
      const usage = updated.usage.used;
      return {
        key: updated.key,
        usage,
        limit,
        remaining: limit - usage,
      };
    }

    const limit = entitlement.usage.getEffectiveLimit();
    if (entitlement.usage.canConsume(amount)) {
      entitlement.usage.consume(amount);
    } else {
      // Cap at limit instead of throwing; do not stop early
      entitlement.usage.used = limit;
    }
    await this.repo.update(entitlement);

    const usage = entitlement.usage.used;
    return {
      key: entitlement.key,
      usage,
      limit,
      remaining: limit - usage,
    };
  }
}
