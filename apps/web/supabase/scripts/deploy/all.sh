#!/bin/bash
set -e
echo "Deploying Supabase database and migrations..."
npx supabase db push

echo "Deploying Supabase functions..."
bash "$(dirname "$0")/functions.sh"


echo "Supabase deployed - ALL done"
