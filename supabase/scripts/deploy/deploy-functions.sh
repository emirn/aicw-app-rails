#!/bin/bash
set -e
echo "Deploying Supabase functions..."
# The --project-ref is omitted; ensure SUPABASE_PROJECT_ID is set in your environment.
npx supabase functions deploy view --use-api
echo "Supabase functions deployed"
