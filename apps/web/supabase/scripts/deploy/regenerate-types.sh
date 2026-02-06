#!/bin/bash
set -e

# Read Supabase config
SUPABASE_CONFIG="$PROJECT_ROOT/supabase/config.toml"
if [[ ! -f "$SUPABASE_CONFIG" ]]; then
    echo -e "${RED}Supabase config not found: $SUPABASE_CONFIG${NC}"
    echo "   Run 'npx supabase link --project-ref <your-eu-project-id>' first"
    exit 1
fi

SUPABASE_PROJECT_ID=$(grep '^project_id' "$SUPABASE_CONFIG" | sed 's/project_id = "\(.*\)"/\1/')
SUPABASE_URL="https://${SUPABASE_PROJECT_ID}.supabase.co"

echo "Regenerating Supabase types..."
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > ./src/integrations/supabase/types.ts
echo "Supabase types regenerated"
