# =============================================================================
# AICW CDN Infrastructure - Variables
# =============================================================================

variable "aws_region" {
  description = "AWS region for S3 bucket"
  type        = string
  default     = "eu-central-1"
}

variable "bucket_name" {
  description = "S3 bucket name (should match domain for clarity)"
  type        = string
  default     = "t.aicw.io"
}

variable "domain_name" {
  description = "Custom domain for CloudFront distribution"
  type        = string
  default     = "t.aicw.io"
}

variable "environment" {
  description = "Environment tag (production, staging, etc.)"
  type        = string
  default     = "production"
}

variable "iam_user_name" {
  description = "Name for the IAM deployment user"
  type        = string
  default     = "cdn-aichatwatch-deployer"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class (PriceClass_All, PriceClass_200, PriceClass_100)"
  type        = string
  default     = "PriceClass_All"
}
