# Access Service

A serverless Lambda function service for retrieving user entitlements in an education payment platform. This service provides secure access to user entitlements based on JWT authentication.

## Overview

The Access Service is an AWS Lambda function that processes API Gateway events to retrieve user entitlements from DynamoDB. It provides a secure RESTful API endpoint that requires JWT authentication to access user-specific entitlement information.

### Features

- **JWT Authentication**: Secure token-based authentication using JWT
- **User Entitlements**: Retrieve all active entitlements for an authenticated user
- **Role-Based Access**: Supports role-based entitlement filtering
- **Usage Tracking**: Returns usage limits and consumption for usage-based entitlements
- **Domain-Driven Design**: Clean architecture with domain entities, use cases, and repositories

## Architecture

The service follows a clean architecture pattern:

```
src/
├── app/             # Application layer (use cases, controllers)
│   └── controllers/ # Request handlers
├── handler/         # Lambda handler and API Gateway integration
│   └── api-gateway/ # API Gateway event processing
└── bootstrap.ts     # Dependency injection and initialization
```

The service uses shared domain libraries from `@libs/domain`:
- `DynamoEntitlementRepository` - DynamoDB repository implementation
- `GetUserEntitlementsUseCase` - Business logic for retrieving entitlements
- `requireUser()` - JWT token extraction and validation

## Environment Variables

The service requires the following environment variables:

### Required

- `ENTITLEMENTS_TABLE` - Name of the DynamoDB table storing entitlements
- `JWT_ACCESS_TOKEN_SECRET` - Secret key for verifying JWT access tokens (automatically retrieved from AWS Secrets Manager)

### JWT Secret Configuration

The JWT secret is automatically retrieved from **AWS Secrets Manager** during deployment. The secret name follows this format:

**Format**: `{project-name}-{environment}-jwt-access-token-secret`

**Examples**:
- `eislett-education-dev-jwt-access-token-secret`
- `eislett-education-prod-jwt-access-token-secret`

**To create the secret in AWS Secrets Manager:**

```bash
# Set your project name and environment
export PROJECT_NAME="${PROJECT_NAME:-eislett-education}"
export ENVIRONMENT="dev"

# Create the secret
aws secretsmanager create-secret \
  --name "${PROJECT_NAME}-${ENVIRONMENT}-jwt-access-token-secret" \
  --description "JWT access token secret for ${ENVIRONMENT} environment" \
  --secret-string "your-jwt-secret-key-here" \
  --region us-east-1
```

### Example `.env` file (for local development)

```bash
# DynamoDB Configuration
ENTITLEMENTS_TABLE={project-name}-dev-entitlements

# JWT Configuration (for local development only)
JWT_ACCESS_TOKEN_SECRET=your-jwt-secret-key-here

# AWS Configuration (if running locally)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### Setting Environment Variables

**For Local Development:**
```bash
# Create a .env file in the service root
echo "ENTITLEMENTS_TABLE={project-name}-dev-entitlements" > .env
echo "JWT_ACCESS_TOKEN_SECRET=your-secret-key" >> .env
```

**For AWS Lambda:**
The JWT secret is automatically retrieved from AWS Secrets Manager. No manual configuration needed. Ensure the secret exists in Secrets Manager with the correct name format.

## Getting Started

### Prerequisites

- Node.js 20+ (or as specified in your project)
- npm (for package management)
- AWS CLI configured (for DynamoDB access)
- DynamoDB table created with appropriate schema
- JWT access token secret configured

### Installation

```bash
# Install dependencies
npm install
```

### Building the Service

```bash
# Build TypeScript to JavaScript
npm run build

# Build in watch mode (auto-rebuild on changes)
npm run build:watch

# Type check without building
npm run type-check

# Clean build artifacts
npm run clean
```

### Packaging for Deployment

```bash
# Package the service for Lambda deployment
npm run package

# This creates function.zip in the service root
```

### Running Locally

This is a Lambda function, so it's designed to run in AWS Lambda. For local development:

1. **Build the service:**
   ```bash
   npm run build
   ```

2. **Use a local Lambda runtime or API Gateway emulator:**
   - [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
   - [Serverless Framework](https://www.serverless.com/)
   - [LocalStack](https://localstack.cloud/)

3. **Development mode with auto-rebuild:**
   ```bash
   # Watch for changes and rebuild
   npm run dev
   ```

### DynamoDB Table Schema

The service expects a DynamoDB table with the following structure:

**Primary Key:**
- `PK` (Partition Key): `USER#{userId}`
- `SK` (Sort Key): `ENTITLEMENT#{entitlementKey}`

**Required Attributes:**
- `userId` (String) - The user ID
- `entitlementKey` (String) - The entitlement key (e.g., `ACCESS_DASHBOARD`, `AI_TOKENS`)
- `role` (String) - User role (e.g., `LEARNER`, `EDUCATOR`)
- `status` (String) - Entitlement status (e.g., `ACTIVE`, `INACTIVE`)
- `grantedAt` (String - ISO 8601) - When the entitlement was granted

**Optional Attributes:**
- `expiresAt` (String - ISO 8601) - When the entitlement expires (if applicable)
- `usage` (Object) - Usage tracking for usage-based entitlements
  - `limit` (Number) - Usage limit
  - `used` (Number) - Current usage
  - `resetAt` (String - ISO 8601) - When usage resets

## API Endpoints

### Get User Entitlements
```
GET /access
```

**Authentication:**
- **Required**: Bearer token in `Authorization` header
- **Format**: `Authorization: Bearer <jwt-token>`
- The JWT token must contain:
  - `id` (string) - User ID
  - `role` (string, optional) - User role

**Response:**
```json
{
  "userId": "user-123",
  "entitlements": {
    "ACCESS_DASHBOARD": true,
    "ACCESS_ANALYTICS": true,
    "AI_TOKENS": {
      "limit": 10000,
      "used": 2500
    },
    "QUIZ_ATTEMPTS": {
      "limit": 50,
      "used": 12
    }
  }
}
```

**Response Format:**
- **Boolean entitlements**: Return `true` if the entitlement is active
- **Usage-based entitlements**: Return an object with `limit` and `used` properties

**Error Responses:**

**401 Unauthorized** - Missing or invalid JWT token:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Authorization token is required"
}
```

**401 Unauthorized** - Invalid or expired token:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired token"
}
```

**404 Not Found** - Route not found:
```json
{
  "message": "Route not found"
}
```

**500 Internal Server Error** - Server error:
```json
{
  "error": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong"
}
```

### Get User Entitlement by Key
```
GET /access/:key
```

**Authentication:**
- **Required**: Bearer token in `Authorization` header
- **Format**: `Authorization: Bearer <jwt-token>`
- The JWT token must contain:
  - `id` (string) - User ID
  - `role` (string, optional) - User role

**Path Parameters:**
- `key` (required) - The entitlement key to check (e.g., `ACCESS_DASHBOARD`, `AI_TOKENS`, `QUIZ_ATTEMPTS`)

**Response (200 OK):**
```json
{
  "userId": "user-123",
  "entitlements": {
    "AI_TOKENS": {
      "limit": 10000,
      "used": 2500
    }
  }
}
```

**Response Format:**
- **Boolean entitlements**: Return `true` if the entitlement is active
- **Usage-based entitlements**: Return an object with `limit` and `used` properties

**Error Responses:**

**401 Unauthorized** - Missing or invalid JWT token:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Authorization token is required"
}
```

**404 Not Found** - Entitlement not found or not active:
```json
{
  "error": "NOT_FOUND",
  "message": "Entitlement 'AI_TOKENS' not found for user 'user-123'"
}
```

**404 Not Found** - Route not found:
```json
{
  "message": "Route not found"
}
```

**500 Internal Server Error** - Server error:
```json
{
  "error": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong"
}
```

**Example Usage:**

```bash
# Check if user has access to AI_TOKENS entitlement
curl -X GET "https://api.example.com/access/AI_TOKENS" \
  -H "Authorization: Bearer <jwt-token>"

# Response if user has access:
{
  "userId": "user-123",
  "entitlements": {
    "AI_TOKENS": {
      "limit": 10000,
      "used": 2500
    }
  }
}

# Response if user doesn't have access (404):
{
  "error": "NOT_FOUND",
  "message": "Entitlement 'AI_TOKENS' not found for user 'user-123'"
}
```

### Increment Usage (usage-based entitlements)
```
POST /access/:key/usage
```

Increments usage for a usage-based entitlement by the given amount (default 1) and returns the updated usage and how much the user has left. Use this when the user consumes a unit of a usage-based entitlement (e.g. one AI request, one quiz attempt).

**Authentication:**
- **Required**: Bearer token in `Authorization` header (same as other endpoints).

**Path Parameters:**
- `key` (required) - The entitlement key (e.g. `AI_TOKENS`, `QUIZ_ATTEMPTS`).

**Request Body (optional):**
```json
{
  "amount": 1
}
```
- `amount` (optional) - Positive integer; number of units to consume. Default: 1.

**Response (200 OK):**
```json
{
  "key": "AI_TOKENS",
  "usage": 2501,
  "limit": 10000,
  "remaining": 7499
}
```
- `key` - The entitlement key.
- `usage` - Current usage (consumed) after this increment.
- `limit` - Effective limit (base limit + permanent limit from one-time purchases).
- `remaining` - How much is left: `limit - usage`.

**Error Responses:**

- **400 DOMAIN_ERROR** - Entitlement is not usage-based:
```json
{
  "error": "DOMAIN_ERROR",
  "message": "Entitlement 'ACCESS_DASHBOARD' is not usage-based"
}
```

- **402 Payment Required** - Usage exhausted (no remaining quota). Returned only when incrementing would exceed the limit:
```json
{
  "status": "usage_exhausted",
  "message": "Usage limit reached. No remaining usage for this entitlement."
}
```

- **401 Unauthorized** - Missing or invalid JWT.
- **404 Not Found** - Entitlement not found or not active for the user.
- **400 VALIDATION_ERROR** - Missing key or invalid `amount` (e.g. not a positive integer).

**Example:**
```bash
# Increment by 1 (default)
curl -X POST "https://api.example.com/access/AI_TOKENS/usage" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json"

# Increment by 5
curl -X POST "https://api.example.com/access/AI_TOKENS/usage" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5}'
```

**Note:** If the entitlement has a reset period (e.g. monthly), usage is lazily reset when it is read or incremented after the reset date. The returned `limit` and `remaining` reflect the current period.

## Entitlement Types

The service supports various entitlement types defined in the domain:

### Boolean Entitlements
These entitlements are either active or inactive (return `true` or not included):

- **ACCESS_DASHBOARD**: Access to main dashboard
- **ACCESS_ANALYTICS**: Advanced analytics dashboard

### Usage-Based Entitlements
These entitlements track usage with limits:

- **AI_TOKENS**: AI token usage (limit and used count)
- **QUIZ_ATTEMPTS**: Quiz attempts per billing period (limit and used count)

### Entitlement Status

Entitlements can have the following statuses:
- `ACTIVE` - Entitlement is active and available
- `INACTIVE` - Entitlement is not active

Only `ACTIVE` entitlements are returned in the response. Expired entitlements (where `expiresAt` is in the past) are also filtered out.

## JWT Token Format

The service expects JWT tokens with the following payload structure:

```json
{
  "id": "user-123",
  "role": "LEARNER",
  "iat": 1234567890,
  "exp": 1234571490
}
```

**Required Claims:**
- `id` (string) - User identifier

**Optional Claims:**
- `role` (string) - User role for role-based filtering

The token must be signed with the secret specified in `JWT_ACCESS_TOKEN_SECRET`.

## Deployment

### Terraform Deployment

The service is deployed using Terraform. The infrastructure configuration is located in `infra/services/access-service/`.

**Key Resources:**
- DynamoDB table: `{project-name}-{environment}-entitlements`
- Lambda function: `access-service`
- API Gateway integration: `/access` endpoint
- IAM role with DynamoDB read permissions

**Deployment Steps:**

1. **Build and package the service:**
   ```bash
   npm run build
   npm run package
   ```

2. **Deploy using Terraform:**
   ```bash
   cd infra/services/access-service
   terraform init \
     -backend-config="bucket={project-name}-{environment}-access-service-state" \
     -backend-config="key=tf-infra/{environment}.tfstate" \
     -backend-config="region=us-east-1" \
     -backend-config="dynamodb_table={project-name}-{environment}-access-service-state-locking" \
     -backend-config="encrypt=true"
   
   terraform apply \
     -var="project_name={project-name}" \
     -var="environment={environment}" \
     -var="state_bucket_name={state-bucket}" \
     -var="state_region=us-east-1" \
     -var="state_bucket_key={state-key}"
   ```

### CI/CD Deployment

The service is automatically deployed via GitHub Actions when changes are pushed to the repository. The workflow:

1. Builds the service
2. Packages it into `function.zip`
3. Bootstraps Terraform backend (S3 bucket and DynamoDB table for state)
4. Deploys infrastructure using Terraform

## Testing

### Manual Testing

**Using cURL:**

```bash
# Get user entitlements
curl -X GET https://api.example.com/access \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Using Postman:**
1. Set method to `GET`
2. Set URL to `https://api.example.com/access`
3. Add header: `Authorization: Bearer YOUR_JWT_TOKEN`
4. Send request

### Unit Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Error Handling

The service handles various error scenarios:

1. **Authentication Errors**: Missing or invalid JWT tokens return 401
2. **Not Found Errors**: Invalid routes return 404
3. **Domain Errors**: Business logic errors return 400
4. **Server Errors**: Unexpected errors return 500 with generic message

All errors are logged to CloudWatch for debugging purposes.

## Monitoring

### CloudWatch Logs

The service logs the following information:
- Incoming API Gateway events
- Environment variables (JWT secret is masked)
- Authenticated user information
- Request parsing details
- Handler execution status
- Errors with full stack traces

### Metrics

Monitor the following metrics:
- Lambda invocation count
- Lambda error rate
- Lambda duration
- DynamoDB read capacity
- API Gateway 4xx/5xx errors

## Security Considerations

1. **JWT Secret**: Ensure the JWT secret exists in AWS Secrets Manager with the name `{project-name}-{environment}-jwt-access-token-secret`
2. **Token Validation**: All requests require valid JWT tokens
3. **Least Privilege**: Lambda IAM role has minimal DynamoDB read permissions
4. **No User Input**: The endpoint doesn't accept user input, reducing attack surface
5. **Error Messages**: Generic error messages prevent information leakage

## Troubleshooting

### Common Issues

**401 Unauthorized:**
- Verify JWT token is included in `Authorization` header
- Check token is not expired
- Ensure `JWT_ACCESS_TOKEN_SECRET` matches the signing secret

**500 Internal Server Error:**
- Check CloudWatch logs for detailed error information
- Verify `ENTITLEMENTS_TABLE` environment variable is set correctly
- Ensure DynamoDB table exists and Lambda has read permissions

**No Entitlements Returned:**
- Verify user has active entitlements in DynamoDB
- Check entitlement status is `ACTIVE`
- Ensure entitlements are not expired

## Related Services

- **Product Service**: Manages products that entitlements may be associated with
- **Pricing Service**: Manages pricing for products
- **Entitlement Service**: (If exists) Manages entitlement creation and updates

## Contributing

When contributing to this service:

1. Follow the existing code structure and patterns
2. Maintain clean architecture principles
3. Add appropriate error handling
4. Update this README with any API changes
5. Add tests for new functionality

## License

ISC
