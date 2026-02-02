# API and Events Reference

Complete reference for all API endpoints, SNS topics, and SQS queues in the payment service ecosystem.

## Table of Contents

- [API Endpoints](#api-endpoints)
- [SNS Topics (Events)](#sns-topics-events)
- [SQS Queues](#sqs-queues)
- [Authentication](#authentication)
- [Deployment Order](#deployment-order)

---

## Deployment Order

When deploying services manually or in a new environment, **entitlement-service must be deployed before transaction-service and dunning-service**. Entitlement-service creates the `billing-events` SNS topic; transaction-service and dunning-service look up that topic by name. If the topic does not exist, you will see:

```text
Error: reading SNS Topic ({project}-{env}-billing-events): empty result
```

**Recommended order:**

1. product-service, pricing-service, access-service, trial-service, usage-event-service, (auth-service)
2. **entitlement-service** (creates `billing-events` and `entitlement-updates` SNS topics)
3. transaction-service
4. stripe-service
5. dunning-service

---

## API Endpoints

All endpoints are prefixed with the API Gateway base URL. Authentication is required for most endpoints (see [Authentication](#authentication)).

### Product Service

**Base Path**: `/products`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/products` | Create a new product | Yes |
| `GET` | `/products` | List all products (paginated) | Yes |
| `GET` | `/products/search` | Search products | Yes |
| `GET` | `/products/{id}` | Get product by ID | Yes |
| `PUT` | `/products/{id}` | Update product | Yes |
| `DELETE` | `/products/{id}` | Delete product | Yes |

### Pricing Service

**Base Path**: `/prices`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/prices` | Create a new price | Yes |
| `GET` | `/prices/{id}` | Get price by ID | Yes |
| `GET` | `/prices/product/{productId}` | List prices for a product | Yes |
| `PUT` | `/prices/{id}` | Update price | Yes |
| `DELETE` | `/prices/{id}` | Delete price | Yes |

### Access Service

**Base Path**: `/access`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/access` | Get all user entitlements | Yes |
| `GET` | `/access/:key` | Get specific entitlement by key | Yes |
| `POST` | `/access/usage/:key` | Increment usage for a usage-based entitlement; returns remaining | Yes |

**POST /access/usage/:key**

Increments usage for the given entitlement key and returns how much usage the user has left. Only applies to usage-based entitlements. Path uses `/access/usage/:key` so it is not matched by `GET /access/:key`.

Path: `key` — entitlement key (e.g. `AI_TOKENS`). Example path: `/access/usage/AI_TOKENS`.

Request body (optional):
```json
{
  "amount": 1
}
```
`amount` (optional): positive integer; default 1.

Response (200):
```json
{
  "key": "AI_TOKENS",
  "usage": 2501,
  "limit": 10000,
  "remaining": 7499
}
```
- `usage`: current usage (consumed).
- `limit`: effective limit (base + permanent from one-time purchases).
- `remaining`: how much is left (`limit - usage`).

Errors: `404 NOT_FOUND` (entitlement not found or not active), `400 DOMAIN_ERROR` (entitlement is not usage-based). If the requested increment would exceed the limit, usage is capped at the limit and the response is 200 with `usage = limit`, `remaining = 0` (no error).

**Example**:
```bash
GET /access
GET /access/AI_TUTOR_ACCESS
```

### Stripe Service

**Base Path**: `/stripe`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/stripe/payment-intent` | Create payment intent | Yes |
| `GET` | `/stripe/payment-methods` | List user's payment methods | Yes |
| `GET` | `/stripe/payment-intent/:paymentIntentId/status` | Get payment intent status | Yes |
| `POST` | `/stripe/customer-portal` | Create customer billing portal session | Yes |
| `POST` | `/stripe/webhook` | Stripe webhook endpoint | No (Stripe signature) |

**GET /stripe/payment-methods**

No request body or query. User is identified from the JWT.

Response (200):
```json
{
  "paymentMethods": [
    {
      "id": "pm_xxx",
      "type": "card",
      "card": { "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2025 },
      "isDefault": true
    }
  ]
}
```
If the user has no Stripe customer, `paymentMethods` is `[]`.

**POST /stripe/customer-portal**

Request body:
```json
{
  "returnUrl": "https://yourapp.com/settings/billing"
}
```
`returnUrl` (required): absolute URL to redirect the user to after they leave the Stripe portal.

Response (200):
```json
{
  "url": "https://billing.stripe.com/session/..."
}
```
Redirect the user to `url` to manage payment methods, invoices, and subscription. Errors: `404 NOT_FOUND` if user has no Stripe customer (complete a purchase first).

**Payment Intent Request**:
```json
{
  "priceId": "price_xxx",
  "paymentMethodId": "pm_xxx" // Optional
}
```

**Payment Intent Response**:
```json
{
  "paymentIntentId": "pi_xxx",
  "subscriptionId": "sub_xxx", // If recurring
  "status": "succeeded" | "requires_action" | "processing" | "requires_payment_method",
  "clientSecret": "pi_xxx_secret_xxx", // If requires_action
  "isProcessing": false,
  "requiresAction": false,
  "nextAction": {
    "type": "complete_payment",
    "message": "Use clientSecret with Stripe.js",
    "requiresClientSecret": true
  }
}
```

### Trial Service

**Base Path**: `/trial`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/trial` | Start a free trial for a product | Yes |
| `GET` | `/trial` | Check trial status for a product | Yes |

**Start Trial Request**:
```json
{
  "productId": "prod_xxx",
  "trialDurationHours": 3, // Optional, default 3
  "role": "learner" // Optional
}
```

**Check Trial Status Query Params**:
```
?productId=prod_xxx
```

### Transaction Service

**Base Path**: `/transactions`

| Method | Endpoint | Description | Auth Required | Admin Only |
|--------|----------|-------------|---------------|------------|
| `GET` | `/transactions` | Get user transactions | Yes | No (can filter by userId if admin) |

**Query Parameters**:
- `userId` (optional): Filter by user ID (admin only)
- `limit` (optional): Limit number of results

**Example**:
```bash
GET /transactions
GET /transactions?userId=user-123&limit=50  # Admin only
```

### Auth Service

**Base Path**: `/auth`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/auth/google` | Authenticate with Google OAuth | No |
| `GET` | `/auth/me` | Get current user profile | Yes |
| `PUT` | `/auth/user/preferred-language` | Update preferred language | Yes |

**Google Auth Request**:
```json
{
  "code": "4/0A...", // OAuth authorization code
  "role": "learner", // Optional
  "preferredLanguage": "en" // Optional
}
```

**Google Auth Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "user-123456789",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://...",
    "role": "learner",
    "preferredLanguage": "en"
  }
}
```

### Dunning Service

**Base Path**: `/dunning`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/dunning` | Get user's billing issue status | Yes |

**Response**:
```json
{
  "userId": "user-123",
  "state": "OK" | "ACTION_REQUIRED" | "GRACE_PERIOD" | "RESTRICTED" | "SUSPENDED",
  "portalUrl": "https://billing.stripe.com/...",
  "detectedAt": "2024-01-01T00:00:00.000Z",
  "lastUpdatedAt": "2024-01-01T00:00:00.000Z"
}
```

---

## SNS Topics (Events)

### 1. Billing Events Topic

**Topic Name**: `{project-name}-{environment}-billing-events`  
**Created By**: Entitlement Service  
**Purpose**: Central topic for all billing-related events

#### Event Types Published

| Event Type | Publisher | Description |
|------------|-----------|-------------|
| `payment.successful` | Stripe Service | Payment completed successfully |
| `payment.action_required` | Stripe Service | Payment requires user action (3D Secure, etc.) |
| `payment.failed` | Stripe Service | Payment failed |
| `subscription.created` | Stripe Service | New subscription created |
| `subscription.updated` | Stripe Service | Subscription status changed |
| `subscription.canceled` | Stripe Service | Subscription canceled |
| `subscription.paused` | Stripe Service | Subscription paused |
| `subscription.resumed` | Stripe Service | Subscription resumed |
| `subscription.expired` | Stripe Service | Subscription expired |

#### Subscribers

1. **Entitlement Service** (SQS: `entitlement-queue`)
   - Processes all billing events to manage entitlements
   - No filter policy (receives all events)

2. **Transaction Service** (SQS: `transaction-queue`)
   - Records all billing events as transactions
   - No filter policy (receives all events)

3. **Dunning Service** (SQS: `dunning-queue`)
   - Processes payment failures and action required events
   - **Filter Policy**: Only receives:
     - `payment.action_required`
     - `payment.failed`
     - `payment.successful`
     - `subscription.updated`

#### Event Structure

```json
{
  "type": "payment.successful",
  "payload": {
    "paymentIntentId": "pi_xxx",
    "userId": "user-123",
    "amount": 1000,
    "currency": "usd",
    "priceId": "price_xxx",
    "productId": "prod_xxx",
    "subscriptionId": "sub_xxx",
    "billingType": "recurring",
    "provider": "stripe"
  },
  "meta": {
    "eventId": "evt_1234567890_abc123",
    "occurredAt": "2024-01-01T00:00:00.000Z",
    "source": "stripe-service"
  },
  "version": 1
}
```

#### How to Subscribe

**Via Terraform**:
```terraform
resource "aws_sns_topic_subscription" "my_service_subscription" {
  topic_arn = data.aws_sns_topic.billing_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.my_queue.arn
  
  # Optional: Filter policy
  filter_policy = jsonencode({
    eventType = ["payment.successful", "payment.failed"]
  })
}
```

**Via AWS Console**:
1. Go to SNS → Topics → `{project}-{env}-billing-events`
2. Create subscription
3. Choose protocol (SQS, Lambda, Email, etc.)
4. Add filter policy if needed

### 2. Entitlement Updates Topic

**Topic Name**: `{project-name}-{environment}-entitlement-updates`  
**Created By**: Entitlement Service  
**Purpose**: Publishes entitlement lifecycle events

#### Event Types Published

| Event Type | Publisher | Description |
|------------|-----------|-------------|
| `entitlement.created` | Entitlement Service | New entitlement created |
| `entitlement.updated` | Entitlement Service | Entitlement updated (usage, limits, etc.) |
| `entitlement.revoked` | Entitlement Service, Dunning Service | Entitlement revoked |

#### Event Structure

```json
{
  "type": "entitlement.revoked",
  "payload": {
    "userId": "user-123",
    "entitlementKey": "AI_TUTOR_ACCESS",
    "status": "inactive",
    "reason": "non_payment" | "subscription_canceled" | "expired"
  },
  "meta": {
    "eventId": "evt_1234567890_abc123",
    "occurredAt": "2024-01-01T00:00:00.000Z",
    "source": "entitlement-service" | "dunning-service"
  },
  "version": 1
}
```

#### How to Subscribe

Same as billing events topic - use Terraform or AWS Console to create subscriptions.

### 3. User Events Topic

**Topic Name**: `{project-name}-{environment}-user-events`  
**Created By**: Auth Service  
**Purpose**: Publishes user lifecycle events

#### Event Types Published

| Event Type | Publisher | Description |
|------------|-----------|-------------|
| `user.created` | Auth Service | New user created |
| `user.updated` | Auth Service | User profile updated |

#### Event Structure

```json
{
  "type": "user.created",
  "payload": {
    "userId": "user-123456789",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://...",
    "role": "learner",
    "preferredLanguage": "en",
    "provider": "google",
    "providerId": "123456789",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "eventId": "evt_1234567890_abc123",
    "occurredAt": "2024-01-01T00:00:00.000Z",
    "source": "auth-service"
  },
  "version": 1
}
```

#### How to Subscribe

Same pattern as other topics - subscribe via Terraform or AWS Console.

---

## SQS Queues

### 1. Entitlement Queue

**Queue Name**: `{project-name}-{environment}-entitlement-queue`  
**Service**: Entitlement Service  
**Purpose**: Processes billing events to manage entitlements

**DLQ**: `{project-name}-{environment}-entitlement-dlq`  
**Max Receive Count**: 3  
**Batch Size**: 10  
**Visibility Timeout**: 300 seconds (5 minutes)

**Source**: Subscribes to `billing-events` SNS topic (all events)

**Usage**: This queue is managed by the entitlement service. You don't send messages directly - events are automatically forwarded from the SNS topic.

### 2. Transaction Queue

**Queue Name**: `{project-name}-{environment}-transaction-queue`  
**Service**: Transaction Service  
**Purpose**: Records billing events as transactions

**DLQ**: `{project-name}-{environment}-transaction-dlq`  
**Max Receive Count**: 3  
**Batch Size**: 20  
**Visibility Timeout**: 300 seconds (5 minutes)

**Source**: Subscribes to `billing-events` SNS topic (all events)

**Usage**: This queue is managed by the transaction service. Events are automatically forwarded from the SNS topic.

### 3. Dunning Queue

**Queue Name**: `{project-name}-{environment}-dunning-queue`  
**Service**: Dunning Service  
**Purpose**: Processes payment failures and billing issues

**DLQ**: `{project-name}-{environment}-dunning-dlq`  
**Max Receive Count**: 3  
**Batch Size**: 10  
**Visibility Timeout**: 300 seconds (5 minutes)

**Source**: Subscribes to `billing-events` SNS topic with filter policy:
- `payment.action_required`
- `payment.failed`
- `payment.successful`
- `subscription.updated`

**Usage**: This queue is managed by the dunning service. Events are automatically forwarded from the SNS topic.

### 4. Usage Event Queue

**Queue Name**: `{project-name}-{environment}-usage-event-queue`  
**Service**: Usage Event Service  
**Purpose**: Processes entitlement usage consumption events

**DLQ**: `{project-name}-{environment}-usage-event-dlq`  
**Max Receive Count**: 3  
**Batch Size**: 20  
**Visibility Timeout**: 300 seconds (5 minutes)

**Source**: Direct SQS (not from SNS) - producers send messages directly

#### How to Send Messages

**1. Get Queue URL/ARN**

From Terraform outputs:
```bash
terraform output usage_event_queue_url
terraform output usage_event_queue_arn
```

Or from AWS Console: SQS → `{project}-{env}-usage-event-queue`

**2. IAM Permissions**

Add to your Lambda/Service IAM role:
```json
{
  "Effect": "Allow",
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:{project}-{env}-usage-event-queue"
}
```

**3. Send Message (AWS SDK v3 - Node.js)**

```javascript
const { SQSClient, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

const client = new SQSClient({ region: "us-east-1" });
const queueUrl = process.env.USAGE_EVENT_QUEUE_URL;

// Single message
await client.send(new SendMessageCommand({
  QueueUrl: queueUrl,
  MessageBody: JSON.stringify({
    userId: "user-123",
    entitlementKey: "AI_TUTOR_ACCESS",
    amount: 1,
    idempotencyKey: "optional-unique-key",
    metadata: { resourceId: "session-456" }
  })
}));

// Batch (up to 10 per request)
await client.send(new SendMessageBatchCommand({
  QueueUrl: queueUrl,
  Entries: [
    {
      Id: "1",
      MessageBody: JSON.stringify({
        userId: "user-123",
        entitlementKey: "AI_TUTOR_ACCESS",
        amount: 1
      })
    },
    {
      Id: "2",
      MessageBody: JSON.stringify({
        userId: "user-456",
        entitlementKey: "QUESTION_GENERATION",
        amount: 5
      })
    }
  ]
}));
```

**4. Message Format**

```json
{
  "userId": "user-123",
  "entitlementKey": "AI_TUTOR_ACCESS",
  "amount": 1,
  "idempotencyKey": "optional-unique-key",
  "metadata": {
    "resourceId": "session-456",
    "feature": "chat"
  }
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `userId` | Yes | string | User who consumed the entitlement |
| `entitlementKey` | Yes | string | Entitlement key (e.g., `AI_TUTOR_ACCESS`, `QUESTION_GENERATION`) |
| `amount` | No | number | Usage amount (default: 1) |
| `idempotencyKey` | No | string | Optional idempotency key for deduplication |
| `metadata` | No | object | Optional metadata |

**5. Send Message (AWS CLI)**

```bash
aws sqs send-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/{project}-{env}-usage-event-queue \
  --message-body '{"userId":"user-123","entitlementKey":"AI_TUTOR_ACCESS","amount":1}'
```

---

## Authentication

### JWT Token

Most endpoints require a JWT token in the `Authorization` header:

```bash
Authorization: Bearer <jwt-token>
```

### Getting a Token

**1. Google OAuth**:
```bash
POST /auth/google
{
  "code": "4/0A..." // OAuth authorization code from Google
}
```

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

**2. Use Token**:
```bash
curl -H "Authorization: Bearer <token>" https://api.example.com/products
```

### Token Payload

```json
{
  "id": "user-123456789",
  "role": "learner" | "educator" | "admin" | "custom-role"
}
```

### Admin Endpoints

Some endpoints require `role: "admin"`:
- `GET /transactions?userId=xxx` (filter by other users)

---

## Environment Variables

### Topic ARNs

Get from Terraform outputs or AWS Console:

```bash
# Billing Events
BILLING_EVENTS_TOPIC_ARN=arn:aws:sns:us-east-1:ACCOUNT:{project}-{env}-billing-events

# Entitlement Updates
ENTITLEMENT_UPDATES_TOPIC_ARN=arn:aws:sns:us-east-1:ACCOUNT:{project}-{env}-entitlement-updates

# User Events
USER_EVENTS_TOPIC_ARN=arn:aws:sns:us-east-1:ACCOUNT:{project}-{env}-user-events
```

### Queue URLs

```bash
# Usage Event Queue
USAGE_EVENT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/{project}-{env}-usage-event-queue
```

---

## Quick Reference

### Publishing to SNS

```javascript
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const client = new SNSClient({ region: "us-east-1" });

await client.send(new PublishCommand({
  TopicArn: process.env.BILLING_EVENTS_TOPIC_ARN,
  Message: JSON.stringify({
    type: "payment.successful",
    payload: { ... },
    meta: { ... },
    version: 1
  }),
  MessageAttributes: {
    eventType: {
      DataType: "String",
      StringValue: "payment.successful"
    }
  }
}));
```

### Subscribing to SNS (via SQS)

1. Create SQS queue
2. Create SNS subscription pointing to queue
3. Add filter policy if needed
4. Lambda processes messages from queue

### Sending to SQS

```javascript
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const client = new SQSClient({ region: "us-east-1" });

await client.send(new SendMessageCommand({
  QueueUrl: process.env.USAGE_EVENT_QUEUE_URL,
  MessageBody: JSON.stringify({
    userId: "user-123",
    entitlementKey: "AI_TUTOR_ACCESS",
    amount: 1
  })
}));
```

---

## Support

For questions or issues:
- Check service-specific README files in `services/{service-name}/README.md`
- Review Terraform outputs for ARNs and URLs
- Check AWS CloudWatch Logs for service logs
