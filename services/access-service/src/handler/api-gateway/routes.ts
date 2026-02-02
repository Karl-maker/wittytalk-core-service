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
  "POST /access/usage/:key": incrementUsageController.handle, // before /access/:key so path /access/usage/X is not matched as key=usage
  "GET /access/:key": getUserEntitlementByKeyController.handle,
};
