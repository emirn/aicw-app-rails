#!/usr/bin/env bash
# migrate-to-full-stack.sh
#
# Run this on the server BEFORE deploying with the full-stack workflow.
# It removes the standalone sgen and aicw-website-builder services
# (containers, proxy routes, old images) so the full-stack deployment
# can boot them as Kamal accessories on the Docker network instead.
#
# Usage:
#   ssh ubuntu@SERVER 'bash -s' < scripts/migrate-to-full-stack.sh
#
# What it does:
#   1. Removes kamal-proxy routes for sgen and aicw-website-builder
#   2. Stops and removes their standalone containers
#   3. Verifies /data/aicw_wb_data exists (bind mount for wbuilder)
#   4. Sets up 1GB swap as safety net for 2GB server
#   5. Prunes old Docker images to free space
#
set -euo pipefail

echo "=== Full-Stack Migration: Remove Standalone Services ==="
echo ""

# 1. Remove kamal-proxy routes
echo "--- Removing kamal-proxy routes ---"
for service in sgen aicw-website-builder; do
  if docker exec kamal-proxy kamal-proxy list 2>/dev/null | grep -q "$service"; then
    echo "Removing proxy route: $service"
    docker exec kamal-proxy kamal-proxy remove --service "$service"
  else
    echo "No proxy route for $service (already removed or never existed)"
  fi
done
echo ""

# 2. Stop and remove standalone containers
echo "--- Stopping standalone containers ---"
for pattern in "sgen-web" "aicw-website-builder-web"; do
  containers=$(docker ps -aq -f "name=$pattern" 2>/dev/null || true)
  if [ -n "$containers" ]; then
    echo "Stopping containers matching: $pattern"
    docker stop $containers 2>/dev/null || true
    docker rm $containers 2>/dev/null || true
  else
    echo "No containers matching: $pattern"
  fi
done
echo ""

# 3. Verify wbuilder data directory exists
echo "--- Checking wbuilder data directory ---"
if [ -d /data/aicw_wb_data ]; then
  echo "/data/aicw_wb_data exists ($(du -sh /data/aicw_wb_data 2>/dev/null | cut -f1) used)"
else
  echo "Creating /data/aicw_wb_data"
  sudo mkdir -p /data/aicw_wb_data
fi
echo ""

# 4. Set up swap (1GB) if not already present
echo "--- Setting up swap ---"
if swapon --show | grep -q /swapfile; then
  echo "Swap already active: $(swapon --show)"
else
  echo "Creating 1GB swap file..."
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  fi
  echo "Swap enabled: $(swapon --show)"
fi
echo ""

# 5. Clean up old Docker images
echo "--- Pruning unused Docker images ---"
docker image prune -f
echo ""

# 6. Summary
echo "=== Migration Complete ==="
echo ""
echo "Remaining containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
echo ""
echo "Proxy routes:"
docker exec kamal-proxy kamal-proxy list 2>/dev/null || echo "(kamal-proxy not running)"
echo ""
echo "Next steps:"
echo "  1. Push a full-v* tag to trigger the full-stack deployment"
echo "     git tag full-v1.1.0 && git push --tags"
echo "  2. After deploy, verify all 3 containers are running:"
echo "     docker ps | grep aicw-app-rails"
