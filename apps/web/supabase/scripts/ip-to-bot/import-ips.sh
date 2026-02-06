#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
CSV_FILE="$DATA_DIR/crawler-ips.csv"

# Load database connection from .env.local
ENV_LOCATIONS=(
    "$SCRIPT_DIR/.env.local"
    "$SCRIPT_DIR/../.env.local"
    "$SCRIPT_DIR/../../.env.local"
    "$SCRIPT_DIR/../../../.env.local"
)

for location in "${ENV_LOCATIONS[@]}"; do
    if [[ -f "$location" ]]; then
        source "$location"
        break
    fi
done

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
    echo "Error: SUPABASE_DB_URL not set"
    echo "Create .env.local with: SUPABASE_DB_URL=postgresql://..."
    exit 1
fi

if [[ ! -f "$CSV_FILE" ]]; then
    echo "Error: CSV file not found: $CSV_FILE"
    exit 1
fi

echo "Importing IP ranges to Supabase..."

# Truncate and import (simpler than drop/recreate)
psql "$SUPABASE_DB_URL" <<EOF
TRUNCATE ip_to_bot;
\copy ip_to_bot FROM '${CSV_FILE}' WITH (FORMAT csv, HEADER true);
EOF

# Show statistics
COUNT=$(psql "$SUPABASE_DB_URL" -t -c "SELECT COUNT(*) FROM ip_to_bot;" | xargs)
echo "✓ Imported $COUNT IP ranges"

# Show breakdown by bot
echo ""
echo "Breakdown by bot:"
psql "$SUPABASE_DB_URL" -c "
  SELECT bot_name, COUNT(*) as ranges
  FROM ip_to_bot
  GROUP BY bot_name
  ORDER BY ranges DESC;
"
