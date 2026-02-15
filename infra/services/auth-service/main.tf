terraform {
  backend "s3" {
    bucket         = "placeholder"
    key            = "placeholder"
    region         = "us-east-1"
    dynamodb_table = "placeholder"
    encrypt        = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

provider "aws" {
  region = "us-east-1"
}

data "terraform_remote_state" "foundation" {
  backend = "s3"

  config = {
    bucket = var.state_bucket_name
    key    = var.state_bucket_key
    region = var.state_region
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Email service queue (for welcome email on first signup)
data "aws_sqs_queue" "email_queue" {
  name = "${var.project_name}-${var.environment}-email-service-queue"
}

# Get JWT secret from AWS Secrets Manager
data "aws_secretsmanager_secret" "jwt_access_token_secret" {
  name = "${var.project_name}-${var.environment}-jwt-access-token-secret"
}

data "aws_secretsmanager_secret_version" "jwt_access_token_secret" {
  secret_id = data.aws_secretsmanager_secret.jwt_access_token_secret.id
}

# Get Google OAuth secret from AWS Secrets Manager
data "aws_secretsmanager_secret" "google_oauth_secret" {
  name = "${var.project_name}-${var.environment}-google-oauth-secret"
}

data "aws_secretsmanager_secret_version" "google_oauth_secret" {
  secret_id = data.aws_secretsmanager_secret.google_oauth_secret.id
}

locals {
  jwt_access_token_secret = try(
    jsondecode(data.aws_secretsmanager_secret_version.jwt_access_token_secret.secret_string)["key"],
    data.aws_secretsmanager_secret_version.jwt_access_token_secret.secret_string
  )
}

# DynamoDB Table for Users
resource "aws_dynamodb_table" "users" {
  name         = "${var.project_name}-${var.environment}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  tags = {
    Environment = var.environment
    Service     = "auth-service"
    Name        = "Users Table"
  }
}

# DynamoDB Table for Authentications
resource "aws_dynamodb_table" "authentications" {
  name         = "${var.project_name}-${var.environment}-authentications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  tags = {
    Environment = var.environment
    Service     = "auth-service"
    Name        = "Authentications Table"
  }
}

# SNS Topic for User Events
resource "aws_sns_topic" "user_events" {
  name = "${var.project_name}-${var.environment}-user-events"

  tags = {
    Environment = var.environment
    Service     = "auth-service"
    Name        = "User Events Topic"
  }

  lifecycle {
    ignore_changes = [tags]
  }
}

module "auth_service_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "auth-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.users.arn,
    "${aws_dynamodb_table.users.arn}/index/*",
    aws_dynamodb_table.authentications.arn,
    "${aws_dynamodb_table.authentications.arn}/index/*"
  ]

  tags = {
    Environment = var.environment
    Service     = "auth-service"
  }
}

# Additional IAM Policy for Secrets Manager
resource "aws_iam_role_policy" "secrets_manager" {
  name = "auth-service-secrets-manager-${var.environment}"
  role = module.auth_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          data.aws_secretsmanager_secret.jwt_access_token_secret.arn,
          data.aws_secretsmanager_secret.google_oauth_secret.arn
        ]
      }
    ]
  })
}

# Additional IAM Policy for SNS
resource "aws_iam_role_policy" "sns_publish" {
  name = "auth-service-sns-publish-${var.environment}"
  role = module.auth_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = [
          aws_sns_topic.user_events.arn
        ]
      }
    ]
  })
}

# Additional IAM Policy for SQS (welcome email to email-service queue)
resource "aws_iam_role_policy" "sqs_send_email" {
  name = "auth-service-sqs-send-email-${var.environment}"
  role = module.auth_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = data.aws_sqs_queue.email_queue.arn
      }
    ]
  })
}

module "auth_service_lambda" {
  source = "../../modules/lambda"

  function_name = "auth-service"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.cwd}/services/auth-service/function.zip")
  iam_role_arn  = module.auth_service_iam_role.role_arn
  timeout       = 15
  memory_size   = 256

  environment_variables = {
    USERS_TABLE            = aws_dynamodb_table.users.name
    AUTHENTICATIONS_TABLE  = aws_dynamodb_table.authentications.name
    USER_EVENTS_TOPIC_ARN  = aws_sns_topic.user_events.arn
    EMAIL_QUEUE_URL        = data.aws_sqs_queue.email_queue.url
    PROJECT_NAME           = var.project_name
    ENVIRONMENT            = var.environment
  }
}

module "lambda_api_link" {
  source = "../../modules/lambda_api_link"
  api_gateway_id      = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.auth_service_lambda.function_arn
  lambda_function_name = module.auth_service_lambda.function_name
  paths = ["auth"]
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}
