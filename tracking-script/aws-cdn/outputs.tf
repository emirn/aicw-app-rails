# =============================================================================
# AICW CDN Infrastructure - Outputs
# =============================================================================

output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.cdn.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.cdn.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (use in script/.env)"
  value       = aws_cloudfront_distribution.cdn.id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = aws_cloudfront_distribution.cdn.arn
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.cdn.domain_name
}

output "cdn_url" {
  description = "Full CDN URL for the tracking script"
  value       = "https://${var.domain_name}/aicw-view.js"
}

output "iam_user_name" {
  description = "Name of the IAM deployment user"
  value       = aws_iam_user.deployer.name
}

output "iam_user_arn" {
  description = "ARN of the IAM deployment user"
  value       = aws_iam_user.deployer.arn
}

# Access key outputs (sensitive)
output "aws_access_key_id" {
  description = "AWS Access Key ID for deployment (add to script/.env)"
  value       = aws_iam_access_key.deployer.id
  sensitive   = true
}

output "aws_secret_access_key" {
  description = "AWS Secret Access Key for deployment (add to script/.env)"
  value       = aws_iam_access_key.deployer.secret
  sensitive   = true
}

# DNS configuration help
output "dns_configuration" {
  description = "DNS record to create"
  value       = "Create CNAME: ${var.domain_name} -> ${aws_cloudfront_distribution.cdn.domain_name}"
}

# Certificate validation records
output "certificate_validation_records" {
  description = "DNS records needed for certificate validation"
  value       = aws_acm_certificate.cdn.domain_validation_options
}

# Environment file content helper
output "env_file_content" {
  description = "Content to add to script/.env"
  value       = <<-EOT
    # Add these to script/.env:
    AWS_ACCESS_KEY_ID=${aws_iam_access_key.deployer.id}
    AWS_SECRET_ACCESS_KEY=<run: terraform output -raw aws_secret_access_key>
    CLOUDFRONT_DISTRIBUTION_ID=${aws_cloudfront_distribution.cdn.id}
  EOT
  sensitive   = true
}
