#!/bin/bash
set -e
echo "Deploying Supabase edge functions..."
SUPABASE_PROJECT_ID=vuzocqdmeetootjqnejp
# Docker must be running for static_files (MMDB) to be bundled.
# The --project-ref is omitted; ensure SUPABASE_PROJECT_ID is set in your environment.
npx supabase functions deploy view --project-ref $SUPABASE_PROJECT_ID --use-api --debug
echo "Supabase edge functions deployed"
