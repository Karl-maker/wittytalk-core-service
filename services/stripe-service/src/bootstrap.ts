import { StripeClient } from "./infrastructure/stripe.client";
import { StripeCustomerRepository } from "./infrastructure/stripe-customer.repository";
import { WebhookIdempotencyRepository } from "./infrastructure/webhook-idempotency.repository";
import { BillingEventPublisher } from "./infrastructure/event.publisher";
import { CreatePaymentIntentUseCase } from "./app/usecases/create.payment.intent.usecase";
import { HandleWebhookUseCase } from "./app/usecases/handle.webhook.usecase";
import { CreatePaymentIntentController } from "./app/controllers/create.payment.intent.controller";
import { WebhookController } from "./app/controllers/webhook.controller";
import { GetPaymentMethodsController } from "./app/controllers/get.payment.methods.controller";
import { GetPaymentIntentStatusController } from "./app/controllers/get.payment.intent.status.controller";
import { CreateCustomerPortalController } from "./app/controllers/create.customer.portal.controller";
import {
  GetProductUseCase,
  GetPriceUseCase,
  UpdateProductUseCase,
  UpdatePriceUseCase,
  DynamoProductRepository,
  DynamoPriceRepository,
  ListPricesByProductUseCase,
} from "@libs/domain";

export function bootstrap() {
  const stripeClient = new StripeClient();
  const customerRepo = new StripeCustomerRepository();
  const idempotencyRepo = new WebhookIdempotencyRepository();
  const eventPublisher = new BillingEventPublisher();

  // Product and Price repositories
  const productRepo = new DynamoProductRepository();
  const priceRepo = new DynamoPriceRepository();

  // Use cases
  const getProductUseCase = new GetProductUseCase(productRepo);
  const getPriceUseCase = new GetPriceUseCase(priceRepo);
  const updateProductUseCase = new UpdateProductUseCase(productRepo);
  const updatePriceUseCase = new UpdatePriceUseCase(priceRepo);
  const listPricesByProductUseCase = new ListPricesByProductUseCase(priceRepo);

  const createPaymentIntentUseCase = new CreatePaymentIntentUseCase(
    stripeClient,
    customerRepo,
    getProductUseCase,
    getPriceUseCase,
    updateProductUseCase,
    updatePriceUseCase,
    listPricesByProductUseCase
  );

  const handleWebhookUseCase = new HandleWebhookUseCase(
    idempotencyRepo,
    eventPublisher,
    customerRepo,
    stripeClient,
    getProductUseCase
  );

  // Controllers
  const createPaymentIntentController = new CreatePaymentIntentController(
    createPaymentIntentUseCase
  );

  const webhookController = new WebhookController(
    handleWebhookUseCase,
    stripeClient
  );

  const getPaymentMethodsController = new GetPaymentMethodsController(
    stripeClient,
    customerRepo
  );

  const getPaymentIntentStatusController = new GetPaymentIntentStatusController(
    stripeClient
  );

  const createCustomerPortalController = new CreateCustomerPortalController(
    stripeClient,
    customerRepo
  );

  return {
    createPaymentIntentController,
    webhookController,
    getPaymentMethodsController,
    getPaymentIntentStatusController,
    createCustomerPortalController,
  };
}
