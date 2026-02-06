#!/bin/bash
#
# First-time server setup for aicw-website-builder
# Installs Docker and Kamal Proxy on the server
#

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}AICW Website Builder - Server Setup${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Get script directory and deployment directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$(cd "$DEPLOYMENT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$API_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT" || exit 1

# Check if .env.kamal exists
if [ ! -f "$DEPLOYMENT_DIR/.env.kamal" ]; then
  echo -e "${RED}Error: $DEPLOYMENT_DIR/.env.kamal not found${NC}"
  echo "Copy .env.kamal.example to .env.kamal and fill in your values"
  exit 1
fi

# Load environment
set -a
source "$DEPLOYMENT_DIR/.env.kamal"
set +a

# Read SSH private key content
if [ -f "$AICW_WB_DEPLOY_SSH_PRIVATE_KEY_PATH" ]; then
  export AICW_WB_DEPLOY_SSH_PRIVATE_KEY=$(cat "$AICW_WB_DEPLOY_SSH_PRIVATE_KEY_PATH")
else
  echo -e "${RED}Error: SSH private key file not found at $AICW_WB_DEPLOY_SSH_PRIVATE_KEY_PATH${NC}"
  exit 1
fi

# Check if kamal is installed
if ! command -v kamal &> /dev/null; then
  echo -e "${RED}Error: kamal command not found${NC}"
  echo "Install: gem install kamal"
  exit 1
fi
echo -e "${GREEN}+ Kamal installed${NC}"

# Verify environment variables
echo -e "${BLUE}Verifying configuration...${NC}"
required_vars=(
  "AICW_WB_SERVER_IP"
  "AICW_WB_DOMAIN"
  "AICW_WB_DEPLOY_USERNAME"
  "KAMAL_REGISTRY_USERNAME"
  "KAMAL_REGISTRY_PASSWORD"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo -e "${RED}Error: $var is not set in .env.kamal${NC}"
    exit 1
  fi
done
echo -e "${GREEN}+ Environment variables configured${NC}"

# Check SSH access
echo -e "${BLUE}Testing SSH connection...${NC}"
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes -i "$AICW_WB_DEPLOY_SSH_PRIVATE_KEY_PATH" "$AICW_WB_DEPLOY_USERNAME@$AICW_WB_SERVER_IP" "echo 'SSH OK'" &> /dev/null; then
  echo -e "${RED}Error: Cannot connect to server via SSH${NC}"
  echo "Server: $AICW_WB_DEPLOY_USERNAME@$AICW_WB_SERVER_IP"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Verify the IP address is correct"
  echo "  2. Verify the SSH key has been added to the server"
  echo "  3. Verify the security group allows SSH (port 22)"
  exit 1
fi
echo -e "${GREEN}+ SSH connection successful${NC}"

# Add SSH key to ssh-agent
echo -e "${BLUE}Setting up SSH authentication...${NC}"
eval "$(ssh-agent -s)"
ssh-add "$AICW_WB_DEPLOY_SSH_PRIVATE_KEY_PATH"
echo -e "${GREEN}+ SSH key added to agent${NC}"

# Run Kamal setup
echo ""
echo -e "${BLUE}Running Kamal setup...${NC}"
echo -e "${YELLOW}This will:${NC}"
echo "  - Install Docker on the server (if not present)"
echo "  - Start Kamal Proxy container"
echo "  - Create necessary directories"
echo ""

if ! kamal setup -c "$DEPLOYMENT_DIR/config/deploy.yml"; then
  echo ""
  echo -e "${RED}Setup failed!${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check the error messages above"
  echo "  2. Verify server has internet access"
  echo "  3. Try running Docker install manually on server"
  exit 1
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Server setup completed successfully!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Ensure DNS A record exists: $AICW_WB_DOMAIN -> $AICW_WB_SERVER_IP"
echo "  2. Deploy the application: ./scripts/kamal-deploy.sh"
echo ""
