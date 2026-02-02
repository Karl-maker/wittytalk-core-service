import { bootstrap } from "../../bootstrap";
import { RequestContext } from "./types";

const {
  createPaymentIntentController,
  webhookController,
  getPaymentMethodsController,
  getPaymentIntentStatusController,
  createCustomerPortalController,
} = bootstrap();

export const routes: Record<
  string,
  (req: RequestContext & { user?: { id: string; role?: string } }) => Promise<any>
> = {
  "POST /stripe/payment-intent": createPaymentIntentController.handle as any,
  "GET /stripe/payment-methods": getPaymentMethodsController.handle as any,
  "GET /stripe/payment-intent/:paymentIntentId/status": getPaymentIntentStatusController.handle as any,
  "POST /stripe/customer-portal": createCustomerPortalController.handle as any,
  "POST /stripe/webhook": webhookController.handle,
};
