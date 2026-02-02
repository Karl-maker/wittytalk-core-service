import { DomainError } from "./domain.error";

/**
 * Thrown when a usage-based entitlement has no remaining quota (user tried to consume beyond limit).
 * Map to HTTP 402 in API responses.
 */
export class UsageExhaustedError extends DomainError {
  constructor(message: string = "Usage limit reached. No remaining usage for this entitlement.") {
    super(message);
    this.name = "UsageExhaustedError";
  }
}
