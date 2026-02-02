# Stripe Service

A serverless Lambda function service that integrates with Stripe to handle payment intents, webhooks, and customer management. This service automatically syncs products and prices with Stripe, manages customer mappings, and publishes billing events to SNS.

## Overview

The Stripe Service provides:
- **Payment Intent Creation**: Creates Stripe checkout sessions for users
- **Customer Management**: Maps users to Stripe customers (prevents duplicate creation)
- **Product/Price Sync**: Automatically creates Stripe products and prices if they don't exist
- **Webhook Processing**: Handles Stripe webhooks with idempotency
- **Event Publishing**: Publishes billing events to SNS for entitlement processing

## Features

- **Automatic Stripe Sync**: Creates Stripe products/prices if missing and updates local records
- **Customer Mapping**: DynamoDB table maps users to Stripe customers
- **Idempotent Webhooks**: Prevents duplicate webhook processing
- **Event Publishing**: Publishes payment and subscription events to SNS
- **JWT Authentication**: Payment intent endpoint requires authentication

## Architecture

```
User Request (JWT) → API Gateway → Lambda
                          ↓
              Create Payment Intent UseCase
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
  Get/Create Stripe Customer      Sync Product/Price
        ↓                                   ↓
  Create Checkout Session          Update Local Records
        ↓
  Return Checkout URL

Stripe Webhook → API Gateway → Lambda
                      ↓
          Webhook Handler UseCase
                      ↓
        ┌─────────────┴─────────────┐
        ↓                           ↓
  Check Idempotency        Process Event
        ↓                           ↓
  Publish to SNS            Mark as Processed
```

## Environment Variables

### Required

- `STRIPE_SECRET_KEY` - Stripe secret API key (from Secrets Manager)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (from Secrets Manager)
- `STRIPE_CUSTOMERS_TABLE` - DynamoDB table for customer mappings
- `WEBHOOK_IDEMPOTENCY_TABLE` - DynamoDB table for webhook idempotency
- `PRODUCTS_TABLE` - DynamoDB table name (from product-service)
- `PRICES_TABLE` - DynamoDB table name (from pricing-service)
- `BILLING_EVENTS_TOPIC_ARN` - SNS topic ARN (from entitlement-service)
- `JWT_ACCESS_TOKEN_SECRET` - JWT secret for authentication (from Secrets Manager)

## API Endpoints

### POST /stripe/payment-intent

Creates a payment intent (checkout session) for a user.

**Authentication**: Required (JWT Bearer token)

**Request Body**:
```json
{
  "priceId": "price_123",
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel"
}
```

**Response**:
```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "paymentIntentId": "pi_123",
  "customerId": "cus_123"
}
```

### GET /stripe/payment-methods

Returns the authenticated user's saved payment methods (cards) and which one is the default.

**Authentication**: Required (JWT Bearer token)

**Request**: No body or query parameters. User is identified from the JWT.

**Response** (200 OK):
```json
{
  "paymentMethods": [
    {
      "id": "pm_xxx",
      "type": "card",
      "card": {
        "brand": "visa",
        "last4": "4242",
        "expMonth": 12,
        "expYear": 2025
      },
      "isDefault": true
    }
  ]
}
```

- If the user has no Stripe customer record (e.g. they have never started checkout or completed a payment), the response is `{ "paymentMethods": [] }`.
- `isDefault` is `true` for the customer's default payment method (used for subscriptions and future payments).
- `card` is omitted for non-card payment methods.

**Example**:
```bash
curl -X GET "https://api.example.com/stripe/payment-methods" \
  -H "Authorization: Bearer <jwt_token>"
```

### POST /stripe/customer-portal

Creates a Stripe [Customer Billing Portal](https://stripe.com/docs/customer-management/portal-deep-dive) session and returns a URL. Redirect the user to this URL so they can manage payment methods, view invoices, update subscription, or resolve billing issues.

**Authentication**: Required (JWT Bearer token)

**Request Body** (or query `returnUrl`):
```json
{
  "returnUrl": "https://yourapp.com/settings/billing"
}
```

- `returnUrl` (required): URL to redirect the user to after they finish in the Stripe portal. Must be an absolute URL.

**Response** (200 OK):
```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

Redirect the user to `url` (e.g. `window.location.href = response.url`). When they are done in the portal, Stripe sends them back to `returnUrl`.

**Error responses**:
- `400` `VALIDATION_ERROR`: Missing or invalid `returnUrl`.
- `401` `UNAUTHORIZED`: Missing or invalid JWT.
- `404` `NOT_FOUND`: User has no Stripe customer (e.g. "No billing account found. Complete a purchase first to manage billing."). Create a payment intent or complete a purchase first so a customer record exists.

**Example**:
```bash
curl -X POST "https://api.example.com/stripe/customer-portal" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"returnUrl": "https://yourapp.com/settings/billing"}'
```

**Note**: Configure the Billing Portal in the [Stripe Dashboard](https://dashboard.stripe.com/settings/billing/portal) (branding, allowed actions, etc.).

### POST /stripe/webhook

Stripe webhook endpoint for processing payment and subscription events.

**Authentication**: Not required (uses Stripe signature verification)

**Headers**:
- `Stripe-Signature`: Stripe webhook signature

**Body**: Raw Stripe webhook event JSON

## Webhook Events Handled

- `payment_intent.succeeded` → Publishes `payment.successful` event
- `payment_intent.payment_failed` → Publishes `payment.failed` event
- `payment_intent.requires_action` → Publishes `payment.action_required` event
- `customer.subscription.created` → Publishes `subscription.created` event
- `customer.subscription.updated` → Publishes `subscription.updated` event
- `customer.subscription.deleted` → Publishes `subscription.canceled` or `subscription.expired` event

## Data Stores

### Stripe Customers Table

Maps application users to Stripe customers:
- **Primary Key**: `userId`
- **GSI**: `stripeCustomerId-index` (for reverse lookup)
- **Fields**: `userId`, `stripeCustomerId`, `role`, `email`, `createdAt`, `updatedAt`

### Webhook Idempotency Table

Tracks processed webhook events:
- **Primary Key**: `eventId` (Stripe event ID)
- **TTL**: `ttl` (30 days)
- **Fields**: `eventId`, `processedAt`, `status`, `ttl`

## Dependencies

- **Product Service**: Reads product configurations
- **Pricing Service**: Reads price configurations
- **Entitlement Processor Service**: Uses billing events SNS topic

## Terraform Infrastructure

The service infrastructure includes:
- Lambda function with API Gateway integration
- DynamoDB tables (customers, webhook idempotency)
- IAM roles with permissions for:
  - DynamoDB (customers, idempotency, products, prices)
  - SNS (publish to billing events topic)
  - Secrets Manager (read Stripe and JWT secrets)

## Stripe Setup & Configuration

### Prerequisites

1. **Stripe Account**: Create a Stripe account at https://stripe.com
2. **API Keys**: Get your Stripe API keys from the Stripe Dashboard
3. **AWS Secrets Manager Access**: Ensure you have permissions to create/read secrets

### Step 1: Get Stripe API Keys

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **API keys**
3. Copy your **Secret key** (starts with `sk_test_` for test mode or `sk_live_` for production)
4. Keep this key secure - you'll need it for the next step

### Step 2: Configure Project Name (Optional)

The project uses a configurable project name prefix for all resource naming. By default, it uses `eislett-education`, but you can customize this via GitHub repository variables.

**To set a custom project name:**
1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **Variables**
2. Add a new variable:
   - **Name**: `PROJECT_NAME`
   - **Value**: Your project name (e.g., `my-company`, `acme-corp`, etc.)
3. The CI/CD pipeline will automatically use this value

**Note**: If `PROJECT_NAME` is not set, it defaults to `eislett-education`.

### Step 3: Create Secrets in AWS Secrets Manager

You need to create three secrets in AWS Secrets Manager. The service will automatically read these during deployment.

**Secret naming format**: `{project-name}-{environment}-{secret-type}`
- `{project-name}` - From GitHub variable `PROJECT_NAME` (defaults to `eislett-education`)
- `{environment}` - `dev`, `staging`, or `prod`
- `{secret-type}` - `stripe-secret-key`, `stripe-webhook-secret`, or `jwt-access-token-secret`

#### Option A: Using AWS CLI

```bash
# Set your environment (dev, staging, or prod)
export ENVIRONMENT="dev"

# Set your project name (or use default 'eislett-education')
export PROJECT_NAME="${PROJECT_NAME:-eislett-education}"

# 1. Create Stripe Secret Key
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-${ENVIRONMENT}-stripe-secret-key" \
  --description "Stripe secret API key for ${ENVIRONMENT} environment" \
  --secret-string "sk_test_YOUR_SECRET_KEY_HERE" \
  --region us-east-1

# 2. Create Stripe Webhook Secret (you'll get this after setting up webhook)
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-${ENVIRONMENT}-stripe-webhook-secret" \
  --description "Stripe webhook signing secret for ${ENVIRONMENT} environment" \
  --secret-string "whsec_YOUR_WEBHOOK_SECRET_HERE" \
  --region us-east-1

# 3. Create JWT Access Token Secret (if not already created)
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-${ENVIRONMENT}-jwt-access-token-secret" \
  --description "JWT access token secret for ${ENVIRONMENT} environment" \
  --secret-string "your-jwt-secret-key-here" \
  --region us-east-1
```

#### Option B: Using AWS Console

1. Go to [AWS Secrets Manager Console](https://console.aws.amazon.com/secretsmanager/)
2. Click **Store a new secret**
3. For each secret:

   **Secret 1: Stripe Secret Key**
   - Select **Other type of secret**
   - Choose **Plaintext**
   - Enter your Stripe secret key: `sk_test_YOUR_KEY_HERE`
   - Click **Next**
   - Secret name: `{project-name}-{environment}-stripe-secret-key`
     - Replace `{project-name}` with your project name (from GitHub variable `PROJECT_NAME`, defaults to `eislett-education`)
     - Replace `{environment}` with `dev`, `staging`, or `prod`
   - Click **Next** → **Store**

   **Secret 2: Stripe Webhook Secret**
   - Select **Other type of secret**
   - Choose **Plaintext**
   - Enter your webhook secret: `whsec_YOUR_SECRET_HERE`
   - Click **Next**
   - Secret name: `{project-name}-{environment}-stripe-webhook-secret`
   - Click **Next** → **Store**

   **Secret 3: JWT Access Token Secret**
   - Select **Other type of secret**
   - Choose **Plaintext**
   - Enter your JWT secret
   - Click **Next**
   - Secret name: `{project-name}-{environment}-jwt-access-token-secret`
   - Click **Next** → **Store**

#### Option C: Using JSON Format

If you prefer JSON format (useful for multiple keys or metadata):

```bash
# Set your project name (or use default)
export PROJECT_NAME="${PROJECT_NAME:-eislett-education}"

# Stripe Secret Key as JSON
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-${ENVIRONMENT}-stripe-secret-key" \
  --secret-string '{"key": "sk_test_YOUR_SECRET_KEY_HERE"}' \
  --region us-east-1

# Webhook Secret as JSON
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-${ENVIRONMENT}-stripe-webhook-secret" \
  --secret-string '{"key": "whsec_YOUR_WEBHOOK_SECRET_HERE"}' \
  --region us-east-1
```

**Note**: The Terraform configuration supports both formats automatically.

### Step 3: Set Up Stripe Webhook

1. **Deploy the service first** (so the webhook endpoint exists)

2. **Get your API Gateway URL**:
   - After deployment, find your API Gateway endpoint URL
   - Format: `https://{api-id}.execute-api.us-east-1.amazonaws.com/stripe/webhook`

3. **Create Webhook in Stripe Dashboard**:
   - Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks**
   - Click **Add endpoint**
   - **Endpoint URL**: `https://{api-id}.execute-api.us-east-1.amazonaws.com/stripe/webhook`
   - **Description**: "Eislett Education Payment Service - {environment}"
   - **Events to send**: Select the following:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.requires_action`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Click **Add endpoint**

4. **Get Webhook Signing Secret**:
   - After creating the webhook, click on it
   - In the **Signing secret** section, click **Reveal**
   - Copy the secret (starts with `whsec_`)
   - Store it in AWS Secrets Manager (see Step 2)

### Step 4: Verify Secrets

Verify your secrets are accessible:

```bash
# Test reading the secret (replace {environment} with your environment)
aws secretsmanager get-secret-value \
  --secret-id "eislett-education-dev-stripe-secret-key" \
  --region us-east-1 \
  --query SecretString \
  --output text
```

### Secret Names Reference

**Format**: `{project-name}-{environment}-{secret-type}`

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `{project-name}-{env}-stripe-secret-key` | Stripe API secret key | `sk_test_51AbC...` |
| `{project-name}-{env}-stripe-webhook-secret` | Stripe webhook signing secret | `whsec_1234567890...` |
| `{project-name}-{env}-jwt-access-token-secret` | JWT secret for authentication | `your-jwt-secret` |

**Where**:
- `{project-name}` - From GitHub variable `PROJECT_NAME` (defaults to `eislett-education`)
- `{env}` - Environment: `dev`, `staging`, or `prod`

**Examples** (with default project name):
- `eislett-education-dev-stripe-secret-key`
- `eislett-education-prod-stripe-webhook-secret`

Replace `{env}` with:
- `dev` - Development environment
- `staging` - Staging environment  
- `prod` - Production environment

### Environment-Specific Setup

#### Development Environment

```bash
export ENVIRONMENT="dev"

# Set project name (or use default)
export PROJECT_NAME="${PROJECT_NAME:-eislett-education}"

# Use Stripe test mode keys (sk_test_...)
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-dev-stripe-secret-key" \
  --secret-string "sk_test_YOUR_TEST_KEY" \
  --region us-east-1
```

#### Production Environment

```bash
export ENVIRONMENT="prod"

# Set project name (or use default)
export PROJECT_NAME="${PROJECT_NAME:-eislett-education}"

# Use Stripe live mode keys (sk_live_...)
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-prod-stripe-secret-key" \
  --secret-string "sk_live_YOUR_LIVE_KEY" \
  --region us-east-1
```

**⚠️ Important**: Never use production Stripe keys in development, and vice versa.

### Updating Secrets

To update an existing secret:

```bash
# Set project name (or use default)
export PROJECT_NAME="${PROJECT_NAME:-eislett-education}"

aws secretsmanager update-secret \
  --secret-id "${PROJECT_NAME}-${ENVIRONMENT}-stripe-secret-key" \
  --secret-string "sk_test_NEW_KEY_HERE" \
  --region us-east-1
```

**Note**: After updating secrets, you may need to restart the Lambda function or wait for it to pick up the new values (Lambda caches environment variables).

### Troubleshooting

#### Secret Not Found Error

If you see: `Secret "{project-name}-{env}-stripe-secret-key" not found`

1. Verify the secret name matches exactly (case-sensitive)
2. Check the environment variable matches your secret name
3. Ensure the secret exists in the correct AWS region (us-east-1)
4. Verify IAM permissions allow reading from Secrets Manager

#### Invalid Secret Format

If Terraform fails to parse the secret:

- **Plain string format**: Just the key value: `sk_test_...`
- **JSON format**: `{"key": "sk_test_..."}`

Both formats are supported, but ensure JSON is valid.

#### Webhook Signature Verification Fails

If webhook requests are rejected:

1. Verify the webhook secret in Secrets Manager matches Stripe Dashboard
2. Check the webhook endpoint URL is correct
3. Ensure the `Stripe-Signature` header is being passed through API Gateway
4. Verify the secret was updated after creating the webhook endpoint

### Security Best Practices

1. **Use Different Keys Per Environment**: Never share keys between dev/staging/prod
2. **Rotate Keys Regularly**: Update secrets periodically for security
3. **Restrict IAM Permissions**: Only grant Secrets Manager read access to the Lambda execution role
4. **Monitor Secret Access**: Enable CloudTrail to audit secret access
5. **Use Secret Rotation**: Consider enabling automatic secret rotation for production

### Testing the Setup

1. **Test Secret Access**:
   ```bash
   # Verify Lambda can read the secret
   aws lambda invoke \
     --function-name stripe-service \
     --payload '{"test": true}' \
     response.json
   ```

2. **Test Webhook**:
   - Use Stripe CLI to send test webhooks:
   ```bash
   stripe listen --forward-to https://your-api.com/stripe/webhook
   stripe trigger payment_intent.succeeded
   ```

3. **Check CloudWatch Logs**:
   - Monitor Lambda logs for any secret-related errors
   - Look for successful webhook processing messages

## Deployment

The service is automatically deployed via GitHub Actions when changes are pushed. The workflow:
1. Builds the service
2. Packages it into `function.zip`
3. Bootstraps Terraform backend
4. Deploys infrastructure using Terraform (reads secrets from Secrets Manager)

## Usage Example

### Creating a Payment Intent

```bash
curl -X POST https://api.example.com/stripe/payment-intent \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "priceId": "price_123",
    "successUrl": "https://example.com/success",
    "cancelUrl": "https://example.com/cancel"
  }'
```

### Setting up Stripe Webhook (Detailed)

**Prerequisites**: Service must be deployed first to have the webhook endpoint available.

1. **Find Your API Gateway URL**:
   - After deployment, get your API Gateway endpoint from AWS Console
   - Or use: `aws apigateway get-rest-apis --query "items[?name=='eislett-education-api'].id" --output text`
   - Webhook URL format: `https://{api-id}.execute-api.us-east-1.amazonaws.com/stripe/webhook`

2. **Create Webhook Endpoint in Stripe**:
   - Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks**
   - Click **Add endpoint**
   - **Endpoint URL**: Your API Gateway URL + `/stripe/webhook`
   - **Description**: "Eislett Education - {environment}"
   - **Events to send**: Select all of these:
     - ✅ `payment_intent.succeeded`
     - ✅ `payment_intent.payment_failed`
     - ✅ `payment_intent.requires_action`
     - ✅ `customer.subscription.created`
     - ✅ `customer.subscription.updated`
     - ✅ `customer.subscription.deleted`
   - Click **Add endpoint**

3. **Get Webhook Signing Secret**:
   - Click on the newly created webhook endpoint
   - Scroll to **Signing secret** section
   - Click **Reveal** to show the secret (starts with `whsec_`)
   - **Copy this secret immediately** - you won't be able to see it again
   - Store it in AWS Secrets Manager (see Step 2 above)

4. **Test the Webhook**:
   - In Stripe Dashboard, click **Send test webhook**
   - Select `payment_intent.succeeded`
   - Check CloudWatch logs to verify it was processed

### Quick Setup Checklist

- [ ] Stripe account created
- [ ] Stripe API keys obtained (test/live)
- [ ] Secrets created in AWS Secrets Manager:
  - [ ] `eislett-education-{env}-stripe-secret-key`
  - [ ] `eislett-education-{env}-stripe-webhook-secret`
  - [ ] `eislett-education-{env}-jwt-access-token-secret`
- [ ] Service deployed
- [ ] Webhook endpoint created in Stripe Dashboard
- [ ] Webhook signing secret stored in Secrets Manager
- [ ] Webhook tested successfully

## Quick Reference

### Secret Names by Environment

**Format**: `{project-name}-{environment}-{secret-type}`

Where `{project-name}` comes from GitHub variable `PROJECT_NAME` (defaults to `eislett-education`).

| Environment | Stripe Secret Key | Webhook Secret | JWT Secret |
|------------|-------------------|----------------|------------|
| **dev** | `{project-name}-dev-stripe-secret-key` | `{project-name}-dev-stripe-webhook-secret` | `{project-name}-dev-jwt-access-token-secret` |
| **staging** | `{project-name}-staging-stripe-secret-key` | `{project-name}-staging-stripe-webhook-secret` | `{project-name}-staging-jwt-access-token-secret` |
| **prod** | `{project-name}-prod-stripe-secret-key` | `{project-name}-prod-stripe-webhook-secret` | `{project-name}-prod-jwt-access-token-secret` |

**Example** (with default `eislett-education`):
- `eislett-education-dev-stripe-secret-key`
- `eislett-education-prod-stripe-webhook-secret`

### Where to Find Stripe Keys

1. **API Keys**: [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Developers → API keys
   - **Test mode**: Keys start with `sk_test_` and `pk_test_`
   - **Live mode**: Keys start with `sk_live_` and `pk_live_`

2. **Webhook Secret**: [Stripe Dashboard](https://dashboard.stripe.com/webhooks) → Developers → Webhooks
   - Click on your webhook endpoint → **Signing secret** section
   - Secret starts with `whsec_`

### Common Commands

```bash
# Set project name (or use default)
export PROJECT_NAME="${PROJECT_NAME:-eislett-education}"

# Create a secret (replace {env} and values)
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-{env}-stripe-secret-key" \
  --secret-string "sk_test_YOUR_KEY" \
  --region us-east-1

# Update a secret
aws secretsmanager update-secret \
  --secret-id "${PROJECT_NAME}-{env}-stripe-secret-key" \
  --secret-string "sk_test_NEW_KEY" \
  --region us-east-1

# Read a secret (for verification)
aws secretsmanager get-secret-value \
  --secret-id "${PROJECT_NAME}-{env}-stripe-secret-key" \
  --region us-east-1 \
  --query SecretString \
  --output text

# List all secrets for this service
aws secretsmanager list-secrets \
  --filters Key=name,Values=${PROJECT_NAME}-{env}-stripe \
  --region us-east-1
```

### Testing Webhooks Locally

Use Stripe CLI to test webhooks before deploying:

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local endpoint
stripe listen --forward-to http://localhost:3000/stripe/webhook

# In another terminal, trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
```

### Monitoring & Debugging

1. **CloudWatch Logs**: Check Lambda function logs for errors
   - Log group: `/aws/lambda/stripe-service`
   - Look for: Secret access errors, webhook processing logs

2. **Stripe Dashboard**: Monitor webhook delivery
   - Go to **Developers** → **Webhooks** → Your endpoint
   - View recent events and delivery status

3. **DynamoDB Tables**: Check idempotency tracking
   - Table: `eislett-education-{env}-stripe-webhook-idempotency`
   - Verify events are being marked as processed

## Related Services

- **Product Service**: Provides product configurations
- **Pricing Service**: Provides price configurations
- **Entitlement Processor Service**: Consumes billing events from SNS

## Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [Stripe Testing Guide](https://stripe.com/docs/testing)

## License

ISC
