import { EntitlementRepository } from "../ports/entitlement.repository";
import { NotFoundError } from "../../domain/errors/not-found.error";
import { DomainError } from "../../domain/errors/domain.error";
import { UsageExhaustedError } from "../../domain/errors/usage-exhausted.error";

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
      try {
        updated.usage.consume(amount);
      } catch {
        throw new UsageExhaustedError();
      }
      await this.repo.update(updated);
      const limit = updated.usage.getEffectiveLimit();
      const usage = updated.usage.used;
      return {
        key: updated.key,
        usage,
        limit,
        remaining: limit - usage,
      };
    }

    try {
      entitlement.usage.consume(amount);
    } catch {
      throw new UsageExhaustedError();
    }
    await this.repo.update(entitlement);

    const limit = entitlement.usage.getEffectiveLimit();
    const usage = entitlement.usage.used;
    return {
      key: entitlement.key,
      usage,
      limit,
      remaining: limit - usage,
    };
  }
}
