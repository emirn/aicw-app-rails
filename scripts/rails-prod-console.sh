#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Config
SSH_KEY="$REPO_ROOT/.kamal/aws-lightsail-server-key-jan2026.pem"
SSH_USER="${AICW_RAILS_DEPLOY_USERNAME:-ubuntu}"

# Server IP: from env var or .kamal/server-ip file
if [ -n "${AICW_RAILS_SERVER_IP:-}" ]; then
  SERVER_IP="$AICW_RAILS_SERVER_IP"
elif [ -f "$REPO_ROOT/.kamal/server-ip" ]; then
  SERVER_IP="$(cat "$REPO_ROOT/.kamal/server-ip" | tr -d '[:space:]')"
else
  echo "Error: Set AICW_RAILS_SERVER_IP env var or create .kamal/server-ip file"
  exit 1
fi

ssh -t -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" \
  'docker exec -it $(docker ps --filter "name=aicw-app-rails-web" --format "{{.ID}}" | head -1) bin/rails console'
