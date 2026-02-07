#!/bin/bash
set -e
echo "Deploying Supabase edge functions..."
SUPABASE_PROJECT_ID=vuzocqdmeetootjqnejp
# Docker must be running for local bundling (required for static_files like MMDB).
# Do NOT use --use-api: server-side bundling fails with esm.sh/npm imports.
# Must run from apps/web/ so supabase/ is found in cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."
supabase functions deploy view --project-ref $SUPABASE_PROJECT_ID --debug
echo "Supabase edge functions deployed"
