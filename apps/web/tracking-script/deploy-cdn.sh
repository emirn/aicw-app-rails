#!/bin/bash
set -e

# =============================================================================
# Deploy AICW Tracking Script to AWS S3 + CloudFront CDN
# =============================================================================
#
# Usage: ./script/deploy-cdn.sh
#
# Prerequisites:
#   - AWS CLI installed and configured
#   - Environment variables set:
#     - AWS_ACCESS_KEY_ID
#     - AWS_SECRET_ACCESS_KEY
#     - CLOUDFRONT_DISTRIBUTION_ID
#
# What this script does:
#   1. Validates AWS credentials are set
#   2. Builds/validates the tracking script
#   3. Uploads minified script to S3 with optimal headers
#   4. Invalidates CloudFront cache
#
# =============================================================================

# Configuration
S3_BUCKET="t-eu-central-1.aicw.io"
S3_REGION="eu-central-1"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"
SCRIPT_NAME="aicw-view.min.js"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_FILE="$SCRIPT_DIR/dist/aicw-view.min.js"
VERSION_FILE="$SCRIPT_DIR/dist/.version"
BACKUP_DIR="$SCRIPT_DIR/backups"
MAX_BACKUPS=10

# Load .env file if it exists
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a  # automatically export all variables
    source "$SCRIPT_DIR/.env"
    set +a
fi

# Colors (matching existing script style)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
NC='\033[0m'

log_info() { echo -e "${BLUE}$1${NC}"; }
log_success() { echo -e "${GREEN}$1${NC}"; }
log_warning() { echo -e "${YELLOW}$1${NC}"; }
log_error() { echo -e "${RED}$1${NC}"; }
log_gray() { echo -e "${GRAY}$1${NC}"; }

print_separator() {
    echo -e "${GRAY}$(printf '─%.0s' {1..50})${NC}"
}

echo ""
log_info "🚀 Deploying AICW Tracking Script to CDN..."
print_separator

# =============================================================================
# Step 0: Validate Prerequisites
# =============================================================================
log_info "📋 Step 0/5: Validating prerequisites..."

# Check AWS CLI is installed
if ! command -v aws &> /dev/null; then
    log_error "❌ AWS CLI not found. Install with: brew install awscli"
    exit 1
fi
log_gray "   ✓ AWS CLI found"

# Check AWS credentials
if [[ -z "$AWS_ACCESS_KEY_ID" ]]; then
    log_error "❌ AWS_ACCESS_KEY_ID environment variable not set"
    log_error "   Export it with: export AWS_ACCESS_KEY_ID=your_key"
    exit 1
fi
log_gray "   ✓ AWS_ACCESS_KEY_ID is set"

if [[ -z "$AWS_SECRET_ACCESS_KEY" ]]; then
    log_error "❌ AWS_SECRET_ACCESS_KEY environment variable not set"
    log_error "   Export it with: export AWS_SECRET_ACCESS_KEY=your_secret"
    exit 1
fi
log_gray "   ✓ AWS_SECRET_ACCESS_KEY is set"

# Check CloudFront Distribution ID
if [[ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]]; then
    log_error "❌ CLOUDFRONT_DISTRIBUTION_ID environment variable not set"
    log_error "   Export it with: export CLOUDFRONT_DISTRIBUTION_ID=E1234567890ABC"
    exit 1
fi
log_gray "   ✓ CLOUDFRONT_DISTRIBUTION_ID: $CLOUDFRONT_DISTRIBUTION_ID"

echo ""

# =============================================================================
# Step 1: Build the tracking script
# =============================================================================
log_info "📋 Step 1/5: Building tracking script..."

cd "$SCRIPT_DIR"
npm run build

# Verify output file exists
if [[ ! -f "$SOURCE_FILE" ]]; then
    log_error "❌ Build failed: Output file not found at $SOURCE_FILE"
    exit 1
fi

FILE_SIZE=$(du -h "$SOURCE_FILE" | cut -f1)
log_gray "   Built: $SOURCE_FILE ($FILE_SIZE)"

# Read version from .version file
VERSION=""
if [[ -f "$VERSION_FILE" ]]; then
    VERSION=$(cat "$VERSION_FILE")
    log_gray "   Version: $VERSION"
fi
echo ""

# =============================================================================
# Step 2: Backup current CDN version
# =============================================================================
log_info "📋 Step 2/5: Backing up current CDN version..."

mkdir -p "$BACKUP_DIR"

# Fetch current CDN version and extract its version number
CURRENT_CDN_VERSION=$(curl -s --compressed "https://t.aicw.io/$SCRIPT_NAME" 2>/dev/null | head -c 30 | sed -n 's/.*AICW v\([0-9.]*\).*/\1/p')

if [[ -n "$CURRENT_CDN_VERSION" ]]; then
    BACKUP_FILE="$BACKUP_DIR/aicw-view.min.${CURRENT_CDN_VERSION}.js"
    if [[ ! -f "$BACKUP_FILE" ]]; then
        curl -s --compressed "https://t.aicw.io/$SCRIPT_NAME" -o "$BACKUP_FILE" 2>/dev/null
        log_gray "   Saved backup: aicw-view.min.${CURRENT_CDN_VERSION}.js"
    else
        log_gray "   Backup already exists: aicw-view.min.${CURRENT_CDN_VERSION}.js"
    fi
else
    log_gray "   No existing CDN version to backup (new deploy)"
fi

# Cleanup old backups (keep last N)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.js 2>/dev/null | wc -l | tr -d ' ')
if [[ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]]; then
    ls -t "$BACKUP_DIR"/*.js 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f 2>/dev/null
    log_gray "   Cleaned up old backups (keeping last $MAX_BACKUPS)"
fi
echo ""

# =============================================================================
# Step 3: Upload to S3 with optimal headers
# =============================================================================
log_info "📋 Step 3/5: Uploading to S3..."

# Create a temporary gzipped file
GZIP_FILE=$(mktemp)
gzip -9 -c "$SOURCE_FILE" > "$GZIP_FILE"
GZIP_SIZE=$(du -h "$GZIP_FILE" | cut -f1)
log_gray "   Compressed: $FILE_SIZE → $GZIP_SIZE (gzip)"

# Upload to S3 with:
# - Content-Type: application/javascript
# - Cache-Control: public, max-age=31536000, immutable (1 year for CDN edge caching)
#   Note: We use CloudFront invalidation on each deploy, so long max-age is safe
# - Content-Encoding: gzip (we compress before upload)
aws s3 cp "$GZIP_FILE" "s3://${S3_BUCKET}/${SCRIPT_NAME}" \
    --region "$S3_REGION" \
    --content-type "application/javascript" \
    --content-encoding "gzip" \
    --cache-control "public, max-age=31536000, immutable" \
    --metadata-directive REPLACE

log_success "   ✓ Uploaded to s3://${S3_BUCKET}/${SCRIPT_NAME}"

# Clean up temp file
rm -f "$GZIP_FILE"
echo ""

# =============================================================================
# Step 4: Invalidate CloudFront cache
# =============================================================================
log_info "📋 Step 4/5: Invalidating CloudFront cache..."

INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/${SCRIPT_NAME}" \
    --query 'Invalidation.Id' \
    --output text)

log_gray "   Invalidation ID: $INVALIDATION_ID"
log_gray "   Path: /${SCRIPT_NAME}"
echo ""

# =============================================================================
# Step 5: Verify deployment
# =============================================================================
log_info "📋 Step 5/5: Verifying deployment..."

# Wait a moment for propagation
sleep 2

# Check S3 object exists
if aws s3 ls "s3://${S3_BUCKET}/${SCRIPT_NAME}" --region "$S3_REGION" > /dev/null 2>&1; then
    log_success "   ✓ S3 object verified"
else
    log_warning "   ⚠️  Could not verify S3 object (may need permissions)"
fi

# Check CloudFront invalidation status
INVALIDATION_STATUS=$(aws cloudfront get-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --id "$INVALIDATION_ID" \
    --query 'Invalidation.Status' \
    --output text 2>/dev/null || echo "Unknown")

log_gray "   Invalidation status: $INVALIDATION_STATUS"
echo ""

# =============================================================================
# Done!
# =============================================================================
print_separator
log_success "✅ CDN deployment complete!"
echo ""
echo "   URL: https://t.aicw.io/${SCRIPT_NAME}"
echo ""
echo "   Quick version check:"
echo "     curl -s --compressed https://t.aicw.io/${SCRIPT_NAME} | head -c 50"
echo ""
echo "   Note: CloudFront invalidation may take 1-5 minutes to propagate globally."
echo "   Check invalidation status:"
echo "     aws cloudfront get-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --id $INVALIDATION_ID"
echo ""
