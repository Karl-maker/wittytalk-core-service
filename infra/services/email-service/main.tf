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

# Users table (auth-service): same naming convention for lookup by userId
locals {
  users_table_name = "${var.project_name}-${var.environment}-users"
  users_table_arn  = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${local.users_table_name}"
}

# Secrets Manager: no-reply email SMTP credentials
data "aws_secretsmanager_secret" "no_reply_email" {
  name = "${var.project_name}-${var.environment}-no-reply-email"
}

# ---------------------------------------------------------------------------
# DynamoDB: emails sent (audit)
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "emails_sent" {
  name         = "${var.project_name}-${var.environment}-email-service-sent"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "to"
    type = "S"
  }

  attribute {
    name = "sentAt"
    type = "S"
  }

  global_secondary_index {
    name            = "by-to"
    hash_key        = "to"
    range_key       = "sentAt"
    projection_type = "ALL"
  }

  tags = {
    Environment = var.environment
    Service     = "email-service"
    Name        = "Emails Sent"
  }
}

# ---------------------------------------------------------------------------
# DynamoDB: unsubscribes (block sending to these addresses)
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "unsubscribes" {
  name         = "${var.project_name}-${var.environment}-email-service-unsubscribes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Service     = "email-service"
    Name        = "Email Unsubscribes"
  }
}

# ---------------------------------------------------------------------------
# S3: email templates bucket (HBS files)
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "templates" {
  bucket = "${var.project_name}-${var.environment}-email-service-templates"

  tags = {
    Environment = var.environment
    Service     = "email-service"
    Name        = "Email Templates"
  }
}

resource "aws_s3_bucket_versioning" "templates" {
  bucket = aws_s3_bucket.templates.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ---------------------------------------------------------------------------
# SQS: email queue (batch 20) + DLQ
# ---------------------------------------------------------------------------
resource "aws_sqs_queue" "email_dlq" {
  name = "${var.project_name}-${var.environment}-email-service-dlq"

  tags = {
    Environment = var.environment
    Service     = "email-service"
    Name        = "Email DLQ"
  }
}

resource "aws_sqs_queue" "email_queue" {
  name                       = "${var.project_name}-${var.environment}-email-service-queue"
  visibility_timeout_seconds  = 120
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.email_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Environment = var.environment
    Service     = "email-service"
    Name        = "Email Queue"
  }
}

resource "aws_sqs_queue_policy" "email_queue_policy" {
  queue_url = aws_sqs_queue.email_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSendFromAccount"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.email_queue.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# IAM role for email service Lambdas
# ---------------------------------------------------------------------------
module "email_service_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "email-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.emails_sent.arn,
    "${aws_dynamodb_table.emails_sent.arn}/index/*",
    aws_dynamodb_table.unsubscribes.arn,
    local.users_table_arn
  ]

  tags = {
    Environment = var.environment
    Service     = "email-service"
  }
}

resource "aws_iam_role_policy" "sqs_access" {
  name = "email-service-sqs-${var.environment}"
  role = module.email_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.email_queue.arn,
          aws_sqs_queue.email_dlq.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "s3_templates" {
  name = "email-service-s3-templates-${var.environment}"
  role = module.email_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.templates.arn,
          "${aws_s3_bucket.templates.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "secrets_manager" {
  name = "email-service-secrets-${var.environment}"
  role = module.email_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = data.aws_secretsmanager_secret.no_reply_email.arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda: SQS handler (process queue, send emails)
# ---------------------------------------------------------------------------
module "email_service_lambda" {
  source = "../../modules/lambda"

  function_name = "${var.project_name}-${var.environment}-email-service"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.cwd}/services/email-service/function.zip")
  iam_role_arn  = module.email_service_iam_role.role_arn
  timeout       = 120
  memory_size   = 256

  environment_variables = {
    EMAILS_SENT_TABLE    = aws_dynamodb_table.emails_sent.name
    UNSUBSCRIBES_TABLE   = aws_dynamodb_table.unsubscribes.name
    TEMPLATES_BUCKET     = aws_s3_bucket.templates.id
    NO_REPLY_SECRET_NAME = data.aws_secretsmanager_secret.no_reply_email.name
    USERS_TABLE          = local.users_table_name
  }
}

resource "aws_lambda_event_source_mapping" "email_queue_mapping" {
  event_source_arn                   = aws_sqs_queue.email_queue.arn
  function_name                      = module.email_service_lambda.function_arn
  batch_size                         = 20
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
}

# ---------------------------------------------------------------------------
# Lambda: API Gateway (unsubscribe endpoint)
# ---------------------------------------------------------------------------
module "email_api_lambda" {
  source = "../../modules/lambda"

  function_name = "${var.project_name}-${var.environment}-email-service-api"
  handler       = "api-gateway.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.cwd}/services/email-service/function.zip")
  iam_role_arn  = module.email_service_iam_role.role_arn

  environment_variables = {
    EMAILS_SENT_TABLE    = aws_dynamodb_table.emails_sent.name
    UNSUBSCRIBES_TABLE   = aws_dynamodb_table.unsubscribes.name
    TEMPLATES_BUCKET     = aws_s3_bucket.templates.id
    NO_REPLY_SECRET_NAME = data.aws_secretsmanager_secret.no_reply_email.name
    USERS_TABLE          = local.users_table_name
  }
}

module "email_lambda_api_link" {
  source               = "../../modules/lambda_api_link"
  api_gateway_id       = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id  = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.email_api_lambda.function_arn
  lambda_function_name = module.email_api_lambda.function_name
  paths                = ["email"]
}

resource "aws_api_gateway_deployment" "email_deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.email_lambda_api_link]
}
