#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/.env.local"

echo "🔨 Creating GiST index (2-5 minutes)..."
psql "$SUPABASE_DB_URL" <<'EOSQL'
SET statement_timeout = '600000';
DROP INDEX IF EXISTS idx_ip_range_gist;
CREATE INDEX idx_ip_range_gist ON ip_to_country_ranges USING gist (network inet_ops);
ANALYZE ip_to_country_ranges;
SELECT 'Index created: ' || indexname FROM pg_indexes WHERE indexname = 'idx_ip_range_gist';
EOSQL
echo "✅ Done!"