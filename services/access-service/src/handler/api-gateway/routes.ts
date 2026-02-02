import { bootstrap } from "../../bootstrap";
import { RequestContext } from "./types";

const {
  getUserEntitlementsController,
  getUserEntitlementByKeyController,
  incrementUsageController,
} = bootstrap();

export const routes: Record<
  string,
  (req: RequestContext) => Promise<any>
> = {
  "GET /access": getUserEntitlementsController.handle,
  "GET /access/:key": getUserEntitlementByKeyController.handle,
  "POST /access/:key/usage": incrementUsageController.handle,
};
