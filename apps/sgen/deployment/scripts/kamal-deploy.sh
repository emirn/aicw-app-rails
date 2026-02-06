#!/bin/bash
#
# Deploy sgen to AWS Lightsail using Kamal
# Builds, pushes, and deploys the application
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
echo -e "${BLUE}Sgen Service - Kamal Deployment${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SGEN_DIR="$(cd "$DEPLOYMENT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SGEN_DIR/../../.." && pwd)"

# Change to project root for Docker build context (monorepo root)
cd "$PROJECT_ROOT" || exit 1

# Check if deployment directory exists
if [ ! -f "$DEPLOYMENT_DIR/config/deploy.yml" ]; then
  echo -e "${RED}Error: deploy.yml not found at $DEPLOYMENT_DIR/config/deploy.yml${NC}"
  exit 1
fi

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

# Read SSH private key content into SGEN_DEPLOY_SSH_PRIVATE_KEY
if [ -f "$SGEN_DEPLOY_SSH_PRIVATE_KEY_PATH" ]; then
  export SGEN_DEPLOY_SSH_PRIVATE_KEY=$(cat "$SGEN_DEPLOY_SSH_PRIVATE_KEY_PATH")
else
  echo -e "${RED}Error: SSH private key file not found at $SGEN_DEPLOY_SSH_PRIVATE_KEY_PATH${NC}"
  exit 1
fi

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check if kamal is installed
if ! command -v kamal &> /dev/null; then
  echo -e "${RED}Error: kamal command not found${NC}"
  echo "Install: gem install kamal"
  exit 1
fi
echo -e "${GREEN}+ Kamal installed${NC}"

# Check SSH access
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes -i "$SGEN_DEPLOY_SSH_PRIVATE_KEY_PATH" "$SGEN_DEPLOY_USERNAME@$SGEN_SERVER_IP" "echo 'SSH OK'" &> /dev/null; then
  echo -e "${RED}Error: Cannot connect to server via SSH${NC}"
  echo "Server: $SGEN_DEPLOY_USERNAME@$SGEN_SERVER_IP"
  exit 1
fi
echo -e "${GREEN}+ SSH access verified${NC}"

# Check if server is setup
echo -e "${BLUE}Checking server setup...${NC}"
if ! ssh -i "$SGEN_DEPLOY_SSH_PRIVATE_KEY_PATH" "$SGEN_DEPLOY_USERNAME@$SGEN_SERVER_IP" "docker info" &> /dev/null; then
  echo -e "${RED}Error: Docker not installed on server${NC}"
  echo "Run: ./scripts/kamal-setup.sh"
  exit 1
fi
echo -e "${GREEN}+ Server is ready${NC}"
echo ""

# Add SSH key to ssh-agent for Docker buildx
echo -e "${BLUE}Setting up SSH authentication...${NC}"
eval "$(ssh-agent -s)"
if ssh-add "$SGEN_DEPLOY_SSH_PRIVATE_KEY_PATH" 2>&1; then
  echo -e "${GREEN}+ SSH key added to agent${NC}"
else
  echo -e "${RED}Error: Failed to add SSH key${NC}"
  exit 1
fi
echo ""

# Deploy
echo -e "${BLUE}Starting deployment...${NC}"
echo -e "${YELLOW}This will:${NC}"
echo "  - Build Docker image (monorepo with workspace dependencies)"
echo "  - Push image to GHCR registry"
echo "  - Deploy new container"
echo "  - Run health checks"
echo "  - Stop old container (zero-downtime)"
echo ""

# Run kamal deploy from project root
if ! kamal deploy -c "$DEPLOYMENT_DIR/config/deploy.yml"; then
  echo ""
  echo -e "${RED}Deployment failed!${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check build logs above"
  echo "  2. Check server logs: kamal app logs -c $DEPLOYMENT_DIR/config/deploy.yml"
  echo "  3. Check container status: ssh $SGEN_DEPLOY_USERNAME@$SGEN_SERVER_IP 'docker ps -a'"
  echo "  4. Roll back: kamal rollback -c $DEPLOYMENT_DIR/config/deploy.yml"
  exit 1
fi

echo ""
echo -e "${GREEN}+ Deployment completed successfully!${NC}"
echo ""

# Show deployment info
echo -e "${BLUE}Deployment Information:${NC}"
kamal app details -c "$DEPLOYMENT_DIR/config/deploy.yml"

echo ""
echo -e "${BLUE}Testing health endpoint...${NC}"
if curl -sf "https://$SGEN_DOMAIN/health" > /dev/null 2>&1; then
  echo -e "${GREEN}+ Health check passed${NC}"
  echo -e "${GREEN}+ Sgen is running at https://$SGEN_DOMAIN${NC}"
else
  echo -e "${YELLOW}! Health check failed (container may still be starting)${NC}"
  echo "Check logs: kamal app logs -c $DEPLOYMENT_DIR/config/deploy.yml"
fi

echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "  View logs: kamal app logs -c $DEPLOYMENT_DIR/config/deploy.yml"
echo "  Restart: kamal app boot -c $DEPLOYMENT_DIR/config/deploy.yml"
echo "  Shell: kamal app exec -c $DEPLOYMENT_DIR/config/deploy.yml -i sh"
echo "  Rollback: kamal rollback -c $DEPLOYMENT_DIR/config/deploy.yml"
echo "  Status: kamal app details -c $DEPLOYMENT_DIR/config/deploy.yml"
echo ""
