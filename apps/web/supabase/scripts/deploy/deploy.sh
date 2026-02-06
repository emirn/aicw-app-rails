#!/bin/bash
set -e
echo "Deploying Supabase database and migrations..."
npx supabase db push

echo "Deploying Supabase functions..."
bash "$(dirname "$0")/deploy-functions.sh"

echo "Regenerating Supabase types..."
bash "$(dirname "$0")/regenerate-types.sh"

echo "Supabase deployed - ALL done"
