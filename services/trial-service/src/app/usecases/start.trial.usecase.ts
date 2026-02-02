import {
  TrialRepository,
  TrialRecord,
  ProductRepositoryPorts,
  CreateEntitlementUseCase,
  SyncProductLimitsToEntitlementsUseCase,
  EntitlementRole,
  EntitlementRepository,
  EntitlementStatus,
  ProductNotFoundErrors,
  ProductErrors,
  EntitlementKey,
} from "@libs/domain";

export interface StartTrialInput {
  userId: string;
  productId: string;
  trialDurationHours?: number; // Defaults to 3 hours
  role?: EntitlementRole;
}

export class StartTrialUseCase {
  constructor(
    private readonly trialRepo: TrialRepository,
    private readonly productRepo: ProductRepositoryPorts.ProductRepository,
    private readonly entitlementRepo: EntitlementRepository,
    private readonly createEntitlementUseCase: CreateEntitlementUseCase,
    private readonly syncProductLimitsUseCase: SyncProductLimitsToEntitlementsUseCase
  ) {}

  async execute(input: StartTrialInput): Promise<{ trialId: string; expiresAt: string }> {
    const { userId, productId, trialDurationHours = 3, role = "learner" as EntitlementRole } = input;

    // Check if user already has a trial for this product
    const existingTrial = await this.trialRepo.findByUserAndProduct(userId, productId);
    if (existingTrial) {
      const error: any = new Error(`User already has a trial for product ${productId}. Each user can only trial a product once.`);
      error.name = "DomainError";
      throw error;
    }

    // Get product to validate it exists and get entitlements
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new ProductNotFoundErrors.NotFoundError(`Product ${productId} not found`);
    }

    if (!product.isActive) {
      throw new ProductErrors.DomainError(`Product ${productId} is not active and cannot be trialed`);
    }

    // Calculate trial expiration (3 hours from now by default)
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + trialDurationHours * 60 * 60 * 1000);

    // Create trial record
    const trialRecord = new TrialRecord(
      userId,
      productId,
      startedAt,
      expiresAt,
      "active"
    );
    await this.trialRepo.save(trialRecord);

    // Create entitlements for the product (with expiration = trial expiration)
    // This uses the same logic as subscription creation but with trial expiration
    for (const entitlementKey of product.entitlements) {
      // Check if entitlement already exists
      const existing = await this.entitlementRepo.findByUserAndKey(userId, entitlementKey);

      // Use product's usage limit for this entitlement so usage is set from the start (e.g. 2-minute trial)
      const usageLimitForKey = product.usageLimits?.find(
        (ul) => ul.metric === entitlementKey
      )?.limit;

      if (!existing) {
        // Create new entitlement for trial (with usage limit when product defines one)
        await this.createEntitlementUseCase.execute({
          userId,
          key: entitlementKey as EntitlementKey,
          role,
          expiresAt, // Trial expiration
          ...(usageLimitForKey != null && { usageLimit: usageLimitForKey }),
        });
      } else {
        // Update existing entitlement to extend expiration if trial is longer
        existing.status = EntitlementStatus.ACTIVE;
        // Only update expiration if trial expiration is later than current
        if (!existing.expiresAt || expiresAt > existing.expiresAt) {
          existing.expiresAt = expiresAt;
        }
        await this.entitlementRepo.update(existing);
      }
    }

    // Sync product limits to entitlements (for usage-based entitlements)
    await this.syncProductLimitsUseCase.execute({
      productId,
      userId,
      isAddon: false,
      isOneTimePayment: false, // Trials are like subscriptions, not one-time
    });

    return {
      trialId: `${userId}-${productId}`,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
