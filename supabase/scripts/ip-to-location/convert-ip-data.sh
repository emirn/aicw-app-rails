#!/bin/bash
set -e

echo "🔄 DB-IP CSV Conversion Script"
echo "=============================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# File paths
INPUT_FILE="$SCRIPT_DIR/data/dbip-city-lite-latest.csv.gz"
OUTPUT_FILE="$SCRIPT_DIR/data/.temp/dbip-postgres-ready.csv"
PYTHON_SCRIPT="$SCRIPT_DIR/convert-ip-data.py"

# Check if input file exists
if [[ ! -f "$INPUT_FILE" ]]; then
    echo "❌ Input file not found: $INPUT_FILE"
    echo ""
    echo "Please download DB-IP City Lite from:"
    echo "https://db-ip.com/db/download/ip-to-city-lite"
    echo ""
    echo "Place it at: supabase/data/ip-to-location/dbip-city-lite-latest.csv.gz"
    exit 1
fi

echo "📁 Input:  $INPUT_FILE"
echo "📁 Output: $OUTPUT_FILE"
echo ""

# Check Python version
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}' | cut -d. -f1)
    if [[ "$PYTHON_VERSION" == "3" ]]; then
        PYTHON_CMD="python"
    fi
fi

if [[ -z "$PYTHON_CMD" ]]; then
    echo "❌ Python 3 is required but not found"
    echo "   Install: brew install python3 (macOS) or apt-get install python3 (Linux)"
    exit 1
fi

echo "🐍 Using: $PYTHON_CMD $(${PYTHON_CMD} --version)"
echo ""

# Make Python script executable
chmod +x "$PYTHON_SCRIPT"

# Run conversion
echo "⚙️  Converting DB-IP CSV to PostgreSQL format..."
echo "   This will create a ZIP file with multiple CSV parts..."
echo "   This will take 2-5 minutes for 84MB file..."
echo ""

"$PYTHON_CMD" "$PYTHON_SCRIPT" \
    --input "$INPUT_FILE" \
    --output "$OUTPUT_FILE" \
    --max-size 90

echo ""
echo "=========================================="
echo "✅ CONVERSION COMPLETE!"
echo "=========================================="
echo ""
echo "Two files created:"
echo ""
echo "📦 ${OUTPUT_FILE} - Split files for Dashboard import"
echo "📄 ${OUTPUT_FILE%.zip}-full.csv - Single file for FASTEST import"
echo ""
echo "=========================================="
echo "RECOMMENDED: Fast psql Import (30 seconds)"
echo "=========================================="
echo ""
echo "# Get connection string from Supabase Dashboard:"
echo "# Settings → Database → Connection string → URI"
echo ""
echo "cd supabase/data/ip-to-location"
echo ""
echo "# Option 1: Drop index before import (FASTEST - recommended for fresh DB)"
echo "psql \"\$SUPABASE_DB_URL\" <<EOF"
echo "DROP INDEX IF EXISTS idx_ip_range_gist;"
echo "\\copy ip_to_country_ranges(network, continent_code, country_code, country_name, region_name, city_name) FROM 'dbip-postgres-ready-full.csv' WITH (FORMAT csv, HEADER true);"
echo "CREATE INDEX idx_ip_range_gist ON ip_to_country_ranges USING gist (network inet_ops);"
echo "EOF"
echo ""
echo "# Option 2: Keep index (slower but safer)"
echo "psql \"\$SUPABASE_DB_URL\" -c \"\\copy ip_to_country_ranges(network, continent_code, country_code, country_name, region_name, city_name) FROM 'dbip-postgres-ready-full.csv' WITH (FORMAT csv, HEADER true);\""
echo ""
echo "=========================================="
echo "ALTERNATIVE: Dashboard Import (slower)"
echo "=========================================="
echo ""
echo "1. Extract: unzip dbip-postgres-ready.zip"
echo "2. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/editor"
echo "3. Upload part1.csv (with header) then part2.csv, part3.csv... (no header)"
echo ""
