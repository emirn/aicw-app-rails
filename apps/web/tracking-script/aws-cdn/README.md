# AICW CDN Infrastructure (Terraform)

This directory contains Terraform configuration to create and manage the AWS infrastructure for the AICW CDN.

## Prerequisites

1. **Terraform** installed: `brew install terraform`
2. **AWS CLI** installed: `brew install awscli`
3. **AWS credentials** configured with admin access:
   ```bash
   aws configure
   ```

## What This Creates

- **S3 Bucket**: `t.aicw.io` for storing the tracking script
- **CloudFront Distribution**: Global CDN with custom domain and HTTPS
- **ACM Certificate**: SSL/TLS certificate for `t.aicw.io`
- **IAM User**: Deployment user with minimal permissions for CI/CD
- **IAM Policy**: Permissions for S3 upload and CloudFront invalidation

## Quick Start

```bash
# Deploy everything
./deploy.sh

# Or step by step:
./deploy.sh init    # Initialize Terraform
./deploy.sh plan    # Preview changes
./deploy.sh apply   # Apply changes
./deploy.sh output  # Show outputs (credentials, etc.)
```

## After Deployment

1. **Configure DNS**: Add CNAME record pointing `t.aicw.io` to the CloudFront domain (shown in output)

2. **Validate Certificate**: Add the DNS validation records shown in the output

3. **Copy Credentials** to `../../.env` (i.e., `script/.env`):
   ```bash
   # Get the values
   terraform output -raw aws_access_key_id
   terraform output -raw aws_secret_access_key
   terraform output -raw cloudfront_distribution_id

   # Add to script/.env:
   AWS_ACCESS_KEY_ID=<value>
   AWS_SECRET_ACCESS_KEY=<value>
   CLOUDFRONT_DISTRIBUTION_ID=<value>
   ```

4. **Deploy the tracking script**:
   ```bash
   cd ../../..  # Back to aicw-app root
   npm run tracker:deploy
   ```

## Files

| File | Description |
|------|-------------|
| `main.tf` | Core infrastructure (S3, CloudFront, IAM) |
| `variables.tf` | Input variables with defaults |
| `outputs.tf` | Output values (IDs, credentials, etc.) |
| `terraform.tfvars` | Actual values for this deployment |
| `deploy.sh` | Deployment helper script |

## Commands

| Command | Description |
|---------|-------------|
| `./deploy.sh` | Interactive plan + apply |
| `./deploy.sh plan` | Preview changes only |
| `./deploy.sh apply` | Apply without confirmation |
| `./deploy.sh destroy` | Destroy all resources |
| `./deploy.sh output` | Show all outputs |

## Importing Existing Resources

If resources already exist in AWS, import them:

```bash
# Import S3 bucket
terraform import aws_s3_bucket.cdn t.aicw.io

# Import CloudFront distribution
terraform import aws_cloudfront_distribution.cdn EJ8QOB1OVBIOG

# Import IAM user
terraform import aws_iam_user.deployer cdn-aichatwatch-deployer
```

## Troubleshooting

### "Error: creating S3 Bucket: BucketAlreadyExists"
The bucket already exists. Import it: `terraform import aws_s3_bucket.cdn t.aicw.io`

### "Error: creating CloudFront Distribution: CNAMEAlreadyExists"
The CNAME is already in use by another distribution. Either import the existing distribution or remove the CNAME from it.

### Certificate validation stuck
DNS validation can take a few minutes. Ensure the CNAME records are correctly added in your DNS provider.
