import {
  DynamoEntitlementRepository,
  GetUserEntitlementsUseCase,
  GetUserEntitlementByKeyUseCase,
  IncrementUsageUseCase,
} from "@libs/domain";
import { GetUserEntitlementsController } from "./app/controllers/get.user.entitlements.controller";
import { GetUserEntitlementByKeyController } from "./app/controllers/get.user.entitlement.by.key.controller";
import { IncrementUsageController } from "./app/controllers/increment.usage.controller";

export function bootstrap() {
  const entitlementsTableName = process.env.ENTITLEMENTS_TABLE;
  if (!entitlementsTableName) {
    throw new Error("ENTITLEMENTS_TABLE environment variable is not set");
  }

  const entitlementRepo = new DynamoEntitlementRepository(entitlementsTableName);

  return {
    getUserEntitlementsController: new GetUserEntitlementsController(
      new GetUserEntitlementsUseCase(entitlementRepo),
      new GetUserEntitlementByKeyUseCase(entitlementRepo)
    ),
    getUserEntitlementByKeyController: new GetUserEntitlementByKeyController(
      new GetUserEntitlementByKeyUseCase(entitlementRepo)
    ),
    incrementUsageController: new IncrementUsageController(
      new IncrementUsageUseCase(entitlementRepo)
    ),
  };
}
