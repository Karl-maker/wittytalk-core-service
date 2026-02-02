terraform {
  backend "s3" {
    # Backend configuration is provided via -backend-config flags during terraform init
    # to support dynamic environment-based naming: [project-name]-[environment]-[service-name]-...
    bucket         = "placeholder" # Set via -backend-config
    key            = "placeholder" # Set via -backend-config
    region         = "us-east-1"   # Set via -backend-config
    dynamodb_table = "placeholder" # Set via -backend-config
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

data "terraform_remote_state" "product_service" {
  backend = "s3"

  config = {
    bucket = "${var.project_name}-${var.environment}-product-service-state"
    key    = "tf-infra/${var.environment}.tfstate"
    region = "us-east-1"
  }
}

data "terraform_remote_state" "access_service" {
  backend = "s3"

  config = {
    bucket = "${var.project_name}-${var.environment}-access-service-state"
    key    = "tf-infra/${var.environment}.tfstate"
    region = "us-east-1"
  }
}

# Note: Dunning service remote state is not referenced here to avoid dependency issues
# The DUNNING_TABLE environment variable is optional and will be set manually after dunning-service is deployed
# IAM permissions for dunning table are also optional and can be added later

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Dunning table is looked up by name (using libs/domain), so we construct the ARN
# Format: arn:aws:dynamodb:region:account-id:table/table-name
locals {
  dunning_table_name = "${var.project_name}-${var.environment}-dunning"
  dunning_table_arn  = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${local.dunning_table_name}"
}

# SNS Topic for Billing Events (Input)
resource "aws_sns_topic" "billing_events" {
  name = "${var.project_name}-${var.environment}-billing-events"

  tags = {
    Environment = var.environment
    Service     = "entitlement-service"
    Name        = "Billing Events Topic"
  }

  lifecycle {
    ignore_changes = [tags]
  }
}

# SNS Topic for Entitlement Updates (Output)
resource "aws_sns_topic" "entitlement_updates" {
  name = "${var.project_name}-${var.environment}-entitlement-updates"

  tags = {
    Environment = var.environment
    Service     = "entitlement-service"
    Name        = "Entitlement Updates Topic"
  }

  lifecycle {
    ignore_changes = [tags]
  }
}

# SQS Dead Letter Queue
resource "aws_sqs_queue" "entitlement_dlq" {
  name = "${var.project_name}-${var.environment}-entitlement-dlq"

  tags = {
    Environment = var.environment
    Service     = "entitlement-service"
    Name        = "Entitlement DLQ"
  }
}

# SQS Queue for Entitlement Service
resource "aws_sqs_queue" "entitlement_queue" {
  name                       = "${var.project_name}-${var.environment}-entitlement-queue"
  visibility_timeout_seconds = 300  # 5 minutes
  message_retention_seconds  = 1209600  # 14 days
  receive_wait_time_seconds  = 20  # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.entitlement_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Environment = var.environment
    Service     = "entitlement-service"
    Name        = "Entitlement Queue"
  }
}

# SQS Queue Policy to allow SNS to send messages
resource "aws_sqs_queue_policy" "entitlement_queue_policy" {
  queue_url = aws_sqs_queue.entitlement_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.entitlement_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.billing_events.arn
          }
        }
      }
    ]
  })
}

# SNS Subscription: SQS Queue subscribes to Billing Events Topic
resource "aws_sns_topic_subscription" "billing_events_to_sqs" {
  topic_arn = aws_sns_topic.billing_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.entitlement_queue.arn
}

# DynamoDB Table for Processed Events (Idempotency)
resource "aws_dynamodb_table" "processed_events" {
  name         = "${var.project_name}-${var.environment}-entitlement-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "eventId"

  attribute {
    name = "eventId"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled         = true
  }

  tags = {
    Environment = var.environment
    Service     = "entitlement-service"
    Name        = "Processed Events Table"
  }
}

# IAM Role for Entitlement Service Lambda
module "entitlement_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "entitlement-lambda-role-${var.environment}"

  # DynamoDB permissions
  # Dunning table ARN is constructed from the table name (looked up by name using libs/domain)
  dynamodb_table_arns = concat([
    data.terraform_remote_state.product_service.outputs.products_table_arn,
    "${data.terraform_remote_state.product_service.outputs.products_table_arn}/index/*",
    data.terraform_remote_state.access_service.outputs.entitlements_table_arn,
    "${data.terraform_remote_state.access_service.outputs.entitlements_table_arn}/index/*",
    aws_dynamodb_table.processed_events.arn
  ], [local.dunning_table_arn]) # Dunning table for checking state before revocation

  tags = {
    Environment = var.environment
    Service     = "entitlement-service"
  }
}

# Additional IAM Policy for SNS Publishing
resource "aws_iam_role_policy" "sns_publish" {
  name = "entitlement-sns-publish-${var.environment}"
  role = module.entitlement_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.entitlement_updates.arn
      }
    ]
  })
}

# Additional IAM Policy for SQS
resource "aws_iam_role_policy" "sqs_access" {
  name = "entitlement-sqs-access-${var.environment}"
  role = module.entitlement_iam_role.role_name

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
        Resource = aws_sqs_queue.entitlement_queue.arn
      }
    ]
  })
}

# Lambda Function
module "entitlement_lambda" {
  source = "../../modules/lambda"

  function_name = "entitlement-service"
  handler       = "dist/handler/index.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.cwd}/services/entitlement-service/function.zip")
  iam_role_arn  = module.entitlement_iam_role.role_arn

  environment_variables = {
    PRODUCTS_TABLE                = data.terraform_remote_state.product_service.outputs.products_table_name
    ENTITLEMENTS_TABLE            = data.terraform_remote_state.access_service.outputs.entitlements_table_name
    PROCESSED_EVENTS_TABLE        = aws_dynamodb_table.processed_events.name
    ENTITLEMENT_UPDATES_TOPIC_ARN = aws_sns_topic.entitlement_updates.arn
    DUNNING_TABLE                 = local.dunning_table_name # Looked up by name using libs/domain
  }
}

# Lambda Event Source Mapping (SQS Trigger)
resource "aws_lambda_event_source_mapping" "entitlement_sqs_trigger" {
  event_source_arn = aws_sqs_queue.entitlement_queue.arn
  function_name    = module.entitlement_lambda.function_arn
  batch_size       = 10
  maximum_batching_window_in_seconds = 0  # Invoke as soon as messages available (no wait to batch)

  # Enable partial batch response for DLQ handling
  function_response_types = ["ReportBatchItemFailures"]
}
