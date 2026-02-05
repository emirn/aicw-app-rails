#!/bin/bash
set -e

# =============================================================================
# AICW CDN Infrastructure - Terraform Deployment Script
# =============================================================================
# Usage:
#   ./deploy.sh           # Plan and apply (with confirmation)
#   ./deploy.sh plan      # Plan only (preview changes)
#   ./deploy.sh apply     # Apply only (assumes plan was reviewed)
#   ./deploy.sh destroy   # Destroy all resources (with confirmation)
#   ./deploy.sh output    # Show outputs (including credentials)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}$1${NC}"; }
log_success() { echo -e "${GREEN}$1${NC}"; }
log_warning() { echo -e "${YELLOW}$1${NC}"; }
log_error() { echo -e "${RED}$1${NC}"; }

# Check Terraform is installed
if ! command -v terraform &> /dev/null; then
    log_error "Terraform not found. Install with: brew install terraform"
    exit 1
fi

# Initialize Terraform if needed
if [[ ! -d ".terraform" ]]; then
    log_info "Initializing Terraform..."
    terraform init
    echo ""
fi

ACTION="${1:-default}"

case "$ACTION" in
    plan)
        log_info "Planning infrastructure changes..."
        terraform plan
        ;;

    apply)
        log_info "Applying infrastructure changes..."
        terraform apply -auto-approve
        echo ""
        log_success "Infrastructure deployed!"
        echo ""
        log_info "Next steps:"
        echo "1. Set up DNS: run './deploy.sh output' to see the CNAME target"
        echo "2. Validate ACM certificate (check DNS records)"
        echo "3. Copy credentials to script/.env"
        echo ""
        log_info "To get credentials, run:"
        echo "  terraform output -raw aws_access_key_id"
        echo "  terraform output -raw aws_secret_access_key"
        echo "  terraform output cloudfront_distribution_id"
        ;;

    destroy)
        log_warning "This will DESTROY all CDN infrastructure!"
        read -p "Are you sure? Type 'yes' to confirm: " confirm
        if [[ "$confirm" == "yes" ]]; then
            terraform destroy
        else
            log_info "Cancelled."
        fi
        ;;

    output)
        log_info "Terraform Outputs:"
        echo ""
        terraform output
        echo ""
        log_info "To get sensitive values:"
        echo "  terraform output -raw aws_access_key_id"
        echo "  terraform output -raw aws_secret_access_key"
        ;;

    init)
        log_info "Initializing Terraform..."
        terraform init
        ;;

    default)
        log_info "AICW CDN Infrastructure Deployment"
        echo ""
        log_info "Step 1: Planning changes..."
        terraform plan -out=tfplan
        echo ""
        log_warning "Review the plan above."
        read -p "Apply these changes? (y/n): " confirm
        if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
            log_info "Step 2: Applying changes..."
            terraform apply tfplan
            rm -f tfplan
            echo ""
            log_success "Infrastructure deployed!"
            echo ""
            log_info "Credentials for script/.env:"
            echo "AWS_ACCESS_KEY_ID=$(terraform output -raw aws_access_key_id)"
            echo "AWS_SECRET_ACCESS_KEY=$(terraform output -raw aws_secret_access_key)"
            echo "CLOUDFRONT_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id)"
        else
            rm -f tfplan
            log_info "Cancelled."
        fi
        ;;

    *)
        echo "Usage: $0 [plan|apply|destroy|output|init]"
        exit 1
        ;;
esac
