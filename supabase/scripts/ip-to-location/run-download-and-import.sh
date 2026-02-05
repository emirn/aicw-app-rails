#!/bin/bash
set -e

# ============================================================================
# Download, Convert and Import IP Geolocation Data - Full Pipeline
# ============================================================================
# This script runs the complete pipeline:
#   1. Download IP geolocation data from DB-IP (with caching)
#   2. Convert CSV to PostgreSQL format
#   3. Import to Supabase database
#   4. Rebuild GiST index
#
# Usage:
#   ./run-download-and-import.sh [--force-download]
#
# Options:
#   --force-download    Bypass cache and force fresh download
# ============================================================================

# Parse arguments
FORCE_DOWNLOAD_FLAG=""
for arg in "$@"; do
    case $arg in
        --force-download)
            FORCE_DOWNLOAD_FLAG="--force-download"
            ;;
    esac
done

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"

echo "============================================================================"
echo "  IP Geolocation: Download, Convert & Import to Supabase"
echo "============================================================================"
echo ""

# ============================================================================
# Step 0: Download IP Data
# ============================================================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 0/3: Downloading IP Geolocation Data${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

"$SCRIPT_DIR/download-ip-data.sh" ${FORCE_DOWNLOAD_FLAG}

DOWNLOAD_STATUS=$?
if [ $DOWNLOAD_STATUS -ne 0 ]; then
  echo ""
  echo "❌ Download failed. Please check the error above."
  exit 1
fi

# Set input file path
INPUT_CSV="$DATA_DIR/dbip-city-lite-latest.csv.gz"

echo ""
echo "Using data file: $INPUT_CSV"
echo ""

# ============================================================================
# Step 1: Convert CSV
# ============================================================================

CONVERTED_CSV="$DATA_DIR/.temp/dbip-full.csv"

if [ -f "$CONVERTED_CSV" ]; then
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Step 1: Skipping conversion (file already exists)${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "⚠️  Converted CSV already exists: $CONVERTED_CSV"
  echo "   Skipping conversion step and proceeding to import."
  echo ""
else
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Step 1/3: Converting DB-IP CSV to PostgreSQL format${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  python3 "$SCRIPT_DIR/convert-ip-data.py" \
    --input "$INPUT_CSV"

  CONVERT_STATUS=$?
  if [ $CONVERT_STATUS -ne 0 ]; then
    echo ""
    echo "❌ Conversion failed. Please check the error above."
    exit 1
  fi

  echo ""
  echo -e "${GREEN}✅ Conversion complete!${NC}"
  echo ""
fi

# ============================================================================
# Step 2: Import to Supabase
# ============================================================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2/3: Importing to Supabase Database${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

"$SCRIPT_DIR/import-ip-data.sh"

IMPORT_STATUS=$?
if [ $IMPORT_STATUS -ne 0 ]; then
  echo ""
  echo "❌ Import failed. Please check the error above."
  exit 1
fi

# ============================================================================
# Step 3: Rebuild GiST Index
# ============================================================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3/3: Rebuilding GiST Index${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

"$SCRIPT_DIR/rebuild-ip-index.sh"

REBUILD_STATUS=$?
if [ $REBUILD_STATUS -ne 0 ]; then
  echo ""
  echo "❌ Rebuilding GiST index failed. Please check the error above."
  exit 1
fi

echo ""
echo "============================================================================"
echo -e "  ${GREEN}✅ ALL STEPS COMPLETED SUCCESSFULLY!${NC}"
echo "============================================================================"
echo ""