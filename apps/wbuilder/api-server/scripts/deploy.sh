#!/bin/bash
# Deployment script for AICW Website Builder API
# Run from the api-server directory
#
# Prerequisites:
# 1. Ruby and Kamal installed: gem install kamal
# 2. .env file configured with your secrets
# 3. Server setup complete (run setup-server.sh first)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$API_DIR")"

cd "$API_DIR"

echo "=== AICW Website Builder - Deployment ==="

# Check for .env file
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Copy .env.example to .env and fill in your values"
    exit 1
fi

# Check for kamal
if ! command -v kamal &> /dev/null; then
    echo "Error: Kamal not found!"
    echo "Install with: gem install kamal"
    exit 1
fi

# Load environment variables
source .env

# Validate required variables
required_vars=(
    "AICW_WEBSITE_BUILD_API_KEY"
    "CLOUDFLARE_API_TOKEN"
    "CLOUDFLARE_ACCOUNT_ID"
    "KAMAL_REGISTRY_USERNAME"
    "KAMAL_REGISTRY_PASSWORD"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "Error: $var is not set in .env"
        exit 1
    fi
done

echo "Environment validated."

# Push secrets to server
echo ""
echo "Pushing secrets to server..."
kamal env push

# Deploy
echo ""
echo "Deploying..."
kamal deploy

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "Your API is now available at your configured domain"
echo "Health check: curl https://builder.yourdomain.com/health"
echo ""
