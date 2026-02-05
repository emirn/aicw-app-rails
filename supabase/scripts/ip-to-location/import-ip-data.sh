#!/bin/bash
set -e

# ============================================================================
# Import IP Geolocation Data to Supabase
# ============================================================================
# This script imports the converted DB-IP CSV into a remote Supabase database
# using the fastest method: psql \copy with index optimization
#
# Features:
# - IPv6/IPv4 connection handling (supports connection pooler)
# - Flexible CSV file location detection
# - Validates database connection
# - Shows before/after statistics
# - Drops index before import for 10-100x speedup
# - Rebuilds index after import
# - Comprehensive error handling
# - Progress feedback
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATA_DIR="$SCRIPT_DIR/data"

# CSV file locations (in priority order)
CSV_LOCATIONS=(
    "$DATA_DIR/dbip-postgres-ready-full.csv"
    "$DATA_DIR/.temp/dbip-full.csv"
)

# Configuration file locations
ENV_LOCATIONS=(
    "$DATA_DIR/.env.local"
    "$SCRIPT_DIR/../.env.local"    
    "$SCRIPT_DIR/../../.env.local"    
    "$PROJECT_ROOT/.env.local"
    "$SCRIPT_DIR/.env.local"
)

ENV_EXAMPLE="$DATA_DIR/.env.local.example"

echo "============================================================================"
echo "  IP Geolocation Data Import to Supabase"
echo "============================================================================"
echo ""

# ============================================================================
# 1. Check Prerequisites
# ============================================================================

echo "📋 Checking prerequisites..."

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ Error: psql is not installed${NC}"
    echo ""
    echo "Please install PostgreSQL client:"
    echo "  macOS:   brew install postgresql"
    echo "  Ubuntu:  sudo apt-get install postgresql-client"
    echo "  Fedora:  sudo dnf install postgresql"
    exit 1
fi

echo -e "${GREEN}✓${NC} psql found: $(psql --version | head -1)"

# Find CSV files (single or parts)
PART_LOCATIONS=(
    "$DATA_DIR/.temp"
)

# Check for part files first
PART_FILES=()
PART_DIR=""
for location in "${PART_LOCATIONS[@]}"; do
    if [[ -d "$location" ]] && ls "$location"/part*.csv &>/dev/null; then
        PART_DIR="$location"
        # Sort part files numerically
        while IFS= read -r file; do
            PART_FILES+=("$file")
        done < <(ls "$location"/part*.csv | sort -V)
        break
    fi
done

# Check for single full CSV
CSV_FILE=""
for location in "${CSV_LOCATIONS[@]}"; do
    if [[ -f "$location" ]]; then
        CSV_FILE="$location"
        break
    fi
done

# Determine import mode
IMPORT_MODE=""
if [[ ${#PART_FILES[@]} -gt 0 ]] && [[ -n "$CSV_FILE" ]]; then
    # Both exist - ask user
    echo -e "${CYAN}ℹ${NC}  Found both single CSV and part files"
    echo ""
    echo "Available import methods:"
    echo "  1. Multi-part import (${#PART_FILES[@]} files, $(du -sh "$PART_DIR" 2>/dev/null | cut -f1) total)"
    echo "  2. Single file import ($(du -h "$CSV_FILE" | cut -f1))"
    echo ""
    echo "Multi-part is recommended for large files and slower connections."
    echo ""
    read -p "Choose import method (1/2): " -r
    if [[ $REPLY == "1" ]]; then
        IMPORT_MODE="multi"
    else
        IMPORT_MODE="single"
    fi
elif [[ ${#PART_FILES[@]} -gt 0 ]]; then
    IMPORT_MODE="multi"
elif [[ -n "$CSV_FILE" ]]; then
    IMPORT_MODE="single"
else
    echo -e "${RED}❌ Error: No CSV files found${NC}"
    echo ""
    echo "Searched for:"
    echo "  Part files in:"
    for location in "${PART_LOCATIONS[@]}"; do
        echo "    - $location/part*.csv"
    done
    echo "  Single CSV in:"
    for location in "${CSV_LOCATIONS[@]}"; do
        echo "    - $location"
    done
    echo ""
    echo "Please run the conversion script first:"
    echo "  cd $PROJECT_ROOT"
    echo "  ./script/convert-and-prepare-dbip-csv.sh"
    exit 1
fi

# Display what was found
if [[ "$IMPORT_MODE" == "multi" ]]; then
    TOTAL_SIZE=$(du -sh "$PART_DIR" 2>/dev/null | cut -f1)
    PART_DIR_RELATIVE=$(echo "$PART_DIR" | sed "s|$PROJECT_ROOT/||")
    echo -e "${GREEN}✓${NC} Found ${#PART_FILES[@]} part files in: $PART_DIR_RELATIVE"
    echo "  Total size: $TOTAL_SIZE"
    echo "  Files: part1.csv - part${#PART_FILES[@]}.csv"
elif [[ "$IMPORT_MODE" == "single" ]]; then
    CSV_SIZE=$(du -h "$CSV_FILE" | cut -f1)
    CSV_RELATIVE=$(echo "$CSV_FILE" | sed "s|$PROJECT_ROOT/||")
    echo -e "${GREEN}✓${NC} CSV file found: $CSV_RELATIVE ($CSV_SIZE)"
fi

# ============================================================================
# 2. Load Configuration
# ============================================================================

echo ""
echo "🔐 Loading database configuration..."

# Find config file
ENV_FILE=""
for location in "${ENV_LOCATIONS[@]}"; do
    if [[ -f "$location" ]]; then
        ENV_FILE="$location"
        break
    fi
done

if [[ -z "$ENV_FILE" ]]; then
    echo -e "${RED}❌ Error: Configuration file not found in any of these locations:${NC}"
    for location in "${ENV_LOCATIONS[@]}"; do
        echo "  - $location"
    done
    echo ""
    echo "Please create the configuration file:"
    echo "  cp $ENV_EXAMPLE ${ENV_LOCATIONS[0]}"
    echo "  # Edit and add your Supabase connection string"
    echo ""
    echo "Get your connection string from:"
    echo "  Supabase Dashboard → Settings → Database → Connection string"
    exit 1
fi

# Load environment variables
set -a
source "$ENV_FILE"
set +a

# Validate SUPABASE_DB_URL
if [[ -z "$SUPABASE_DB_URL" ]] || [[ "$SUPABASE_DB_URL" == *"YOUR_PASSWORD_HERE"* ]] || [[ "$SUPABASE_DB_URL" == *"YOUR_PROJECT_ID"* ]]; then
    echo -e "${RED}❌ Error: SUPABASE_DB_URL not configured in $ENV_FILE${NC}"
    echo ""
    echo "Please edit $ENV_FILE and set your actual connection string"
    echo ""
    echo "Get it from: Supabase Dashboard → Settings → Database"
    echo ""
    echo "Choose ONE of these:"
    echo "  1. Connection string (URI) - for IPv6-capable networks"
    echo "  2. Connection pooling → Session mode - for IPv4 networks (RECOMMENDED)"
    exit 1
fi

# Set defaults
DB_CONNECTION_TIMEOUT=${DB_CONNECTION_TIMEOUT:-10}
DB_STATEMENT_TIMEOUT=${DB_STATEMENT_TIMEOUT:-600000}

# Detect connection type
CONNECTION_TYPE="Unknown"
if [[ "$SUPABASE_DB_URL" == *".pooler.supabase.com"* ]]; then
    if [[ "$SUPABASE_DB_URL" == *":6543"* ]]; then
        CONNECTION_TYPE="Transaction pooler (port 6543)"
    else
        CONNECTION_TYPE="Session pooler (port 5432)"
    fi
    echo -e "${CYAN}ℹ${NC}  Connection type: ${CYAN}${CONNECTION_TYPE}${NC} (IPv4/IPv6 compatible)"
elif [[ "$SUPABASE_DB_URL" == *"db."*".supabase.co"* ]]; then
    CONNECTION_TYPE="Direct connection (IPv6)"
    echo -e "${CYAN}ℹ${NC}  Connection type: ${CYAN}${CONNECTION_TYPE}${NC}"
fi

# Mask password in output
MASKED_URL=$(echo "$SUPABASE_DB_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/****:****@/')
echo -e "${GREEN}✓${NC} Database URL: $MASKED_URL"

# ============================================================================
# 3. Test Database Connection
# ============================================================================

echo ""
echo "🔌 Testing database connection..."

# First, check if it's a direct connection and test IPv6 connectivity
if [[ "$CONNECTION_TYPE" == "Direct connection (IPv6)" ]]; then
    # Extract hostname
    HOSTNAME=$(echo "$SUPABASE_DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')

    # Check if host resolves to IPv6
    if host "$HOSTNAME" 2>/dev/null | grep -q "has IPv6 address"; then
        echo -e "${CYAN}ℹ${NC}  Detected IPv6 address for $HOSTNAME"

        # Test IPv6 connectivity
        if ! curl -6 -s --connect-timeout 3 https://ipv6.google.com &>/dev/null; then
            echo -e "${YELLOW}⚠️  Warning: Your network may not support IPv6${NC}"
            echo ""
            echo "If connection fails, use the connection pooler instead:"
            echo "  1. Go to: Supabase Dashboard → Settings → Database"
            echo "  2. Find 'Connection pooling' section"
            echo "  3. Copy 'Session mode' connection string"
            echo "  4. Update $ENV_FILE with the pooler URL"
            echo ""
            echo "Example pooler URL:"
            echo "  postgresql://postgres:****@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
            echo ""
            read -p "Try connecting anyway? (yes/no): " -r
            if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
                echo "Connection cancelled. Please update to use connection pooler."
                exit 1
            fi
        fi
    fi
fi

# Test connection
if ! psql "$SUPABASE_DB_URL" -c "SELECT version();" &> /dev/null; then
    echo -e "${RED}❌ Error: Cannot connect to database${NC}"
    echo ""

    # Provide specific help based on connection type
    if [[ "$CONNECTION_TYPE" == "Direct connection (IPv6)" ]]; then
        echo -e "${YELLOW}Your connection is configured for direct IPv6 access.${NC}"
        echo ""
        echo "Most likely cause: Your network doesn't support IPv6"
        echo ""
        echo "✅ Solution: Use Connection Pooler (IPv4-compatible)"
        echo "  1. Go to: Supabase Dashboard → Settings → Database"
        echo "  2. Find 'Connection pooling' section"
        echo "  3. Copy 'Session mode' connection string"
        echo "  4. Update $ENV_FILE with:"
        echo "     SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
        echo ""
    else
        echo "Please check:"
        echo "  1. Your connection string in $ENV_FILE"
        echo "  2. Password is correct (no extra spaces)"
        echo "  3. Supabase project is not paused"
        echo "  4. Internet connection is working"
        echo ""
    fi

    echo "Connection error details:"
    psql "$SUPABASE_DB_URL" -c "SELECT version();" 2>&1 | head -5
    exit 1
fi

# Get PostgreSQL version
PG_VERSION=$(psql "$SUPABASE_DB_URL" -tAc "SELECT version();" | head -1)
echo -e "${GREEN}✓${NC} Connection successful"
echo "  PostgreSQL: $(echo $PG_VERSION | cut -d',' -f1)"
if [[ "$CONNECTION_TYPE" != "Unknown" ]]; then
    echo "  Via: $CONNECTION_TYPE"
fi

# ============================================================================
# 4. Check Table Exists
# ============================================================================

echo ""
echo "📊 Checking table status..."

TABLE_EXISTS=$(psql "$SUPABASE_DB_URL" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ip_to_country_ranges');")

if [[ "$TABLE_EXISTS" != "t" ]]; then
    echo -e "${RED}❌ Error: Table 'ip_to_country_ranges' does not exist${NC}"
    echo ""
    echo "Please run migrations first:"
    echo "  cd $PROJECT_ROOT"
    echo "  npx supabase db push"
    exit 1
fi

echo -e "${GREEN}✓${NC} Table 'ip_to_country_ranges' exists"

# Get current row count
CURRENT_ROWS=$(psql "$SUPABASE_DB_URL" -tAc "SELECT COUNT(*) FROM ip_to_country_ranges;")
echo "  Current rows: $(printf "%'d" $CURRENT_ROWS)"

# Count rows to be imported
echo ""
echo "📏 Counting rows in CSV files..."
ROWS_TO_IMPORT=0

if [[ "$IMPORT_MODE" == "multi" ]]; then
    # Count rows from all part files
    for PART_FILE in "${PART_FILES[@]}"; do
        PART_ROWS=$(wc -l < "$PART_FILE" 2>/dev/null || echo "0")
        ROWS_TO_IMPORT=$((ROWS_TO_IMPORT + PART_ROWS))
    done
    # Subtract 1 for header in part1
    ROWS_TO_IMPORT=$((ROWS_TO_IMPORT - 1))
    echo "  Will import: $(printf "%'d" $ROWS_TO_IMPORT) rows (from ${#PART_FILES[@]} CSV files)"
else
    # Count rows from single file
    ROWS_TO_IMPORT=$(wc -l < "$CSV_FILE" 2>/dev/null || echo "0")
    # Subtract 1 for header
    ROWS_TO_IMPORT=$((ROWS_TO_IMPORT - 1))
    echo "  Will import: $(printf "%'d" $ROWS_TO_IMPORT) rows (from single CSV file)"
fi

# Check if table has data
if [[ "$CURRENT_ROWS" -gt 0 ]]; then
    echo ""
    echo "============================================================================"
    echo -e "  ${YELLOW}⚠️  DATA CONFLICT DETECTED${NC}"
    echo "============================================================================"
    echo ""
    echo "Current state:"
    echo "  • Table contains:  $(printf "%'d" $CURRENT_ROWS) rows"
    echo "  • Will import:     $(printf "%'d" $ROWS_TO_IMPORT) rows"
    echo ""
    
    # Calculate what final state will be
    if [[ "$CURRENT_ROWS" -eq "$ROWS_TO_IMPORT" ]]; then
        echo -e "${CYAN}ℹ${NC}  Row counts match - this might be a duplicate import"
    elif [[ "$CURRENT_ROWS" -lt "$ROWS_TO_IMPORT" ]]; then
        MISSING_ROWS=$((ROWS_TO_IMPORT - CURRENT_ROWS))
        echo -e "${CYAN}ℹ${NC}  Missing $(printf "%'d" $MISSING_ROWS) rows - previous import may have failed"
    else
        EXTRA_ROWS=$((CURRENT_ROWS - ROWS_TO_IMPORT))
        echo -e "${CYAN}ℹ${NC}  Table has $(printf "%'d" $EXTRA_ROWS) more rows than import file"
    fi
    echo ""
    echo "Options:"
    echo "  yes = TRUNCATE table and import fresh data (recommended)"
    echo "  no  = APPEND new rows to existing data (may create duplicates)"
    echo ""
    read -p "DELETE all existing rows before import? (yes/no): " -r
    echo
    if [[ $REPLY =~ ^[Yy]es$ ]]; then
        echo "🗑️  Truncating table..."
        psql "$SUPABASE_DB_URL" -c "TRUNCATE ip_to_country_ranges;" > /dev/null
        echo -e "${GREEN}✓${NC} Table truncated"
        # Update current rows for later calculations
        CURRENT_ROWS=0
    else
        echo ""
        echo -e "${YELLOW}⚠️  Proceeding without truncating.${NC}"
        FINAL_ESTIMATED_ROWS=$((CURRENT_ROWS + ROWS_TO_IMPORT))
        echo "  New rows will be appended to existing data."
        echo "  Estimated final row count: $(printf "%'d" $FINAL_ESTIMATED_ROWS)"
        echo "  Note: Duplicates may occur if same data is imported again."
        echo ""
        read -p "Continue with append? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
            echo "Import cancelled."
            exit 0
        fi
    fi
fi

# ============================================================================
# 5. Confirm Import
# ============================================================================

echo ""
echo "============================================================================"
echo "  Ready to Import"
echo "============================================================================"
echo ""
if [[ "$IMPORT_MODE" == "multi" ]]; then
    echo "Import mode:   Multi-part (${#PART_FILES[@]} files)"
    echo "Files:         part1.csv - part${#PART_FILES[@]}.csv"
    echo "Total size:    $TOTAL_SIZE"
else
    echo "Import mode:   Single file"
    echo "CSV file:      $CSV_RELATIVE"
    echo "Size:          $CSV_SIZE"
fi
echo "Rows:          ~15 million (estimated)"
echo "Table:         ip_to_country_ranges"
echo "Database:      $MASKED_URL"
echo "Connection:    $CONNECTION_TYPE"
echo ""
echo "Import strategy:"
echo "  1. Drop GiST index (idx_ip_range_gist)"
if [[ "$IMPORT_MODE" == "multi" ]]; then
    echo "  2. Import ${#PART_FILES[@]} CSV parts sequentially"
    echo "     - part1.csv WITH header"
    echo "     - part2-${#PART_FILES[@]}.csv WITHOUT header"
else
    echo "  2. Import CSV using \\copy"
fi
echo "  3. Rebuild GiST index"
echo ""
if [[ "$IMPORT_MODE" == "multi" ]]; then
    echo "Estimated time: ~3-4 minutes (${#PART_FILES[@]} parts × 10-20s + 90s index rebuild)"
else
    echo "Estimated time: ~2 minutes (30s import + 90s index rebuild)"
fi
echo ""

read -p "Start import? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
    echo "Import cancelled."
    exit 0
fi

# ============================================================================
# 6. Drop Index
# ============================================================================

echo ""
echo "🗑️  Dropping index for faster import..."

START_TIME=$(date +%s)

# Check if index exists
INDEX_EXISTS=$(psql "$SUPABASE_DB_URL" -tAc "SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_ip_range_gist');")

if [[ "$INDEX_EXISTS" == "t" ]]; then
    psql "$SUPABASE_DB_URL" -c "DROP INDEX IF EXISTS idx_ip_range_gist;" > /dev/null
    echo -e "${GREEN}✓${NC} Index dropped"
else
    echo -e "${BLUE}ℹ${NC}  Index does not exist (will be created after import)"
fi

# ============================================================================
# 7. Import CSV
# ============================================================================

IMPORT_START=$(date +%s)
TOTAL_ROWS_IMPORTED=0

if [[ "$IMPORT_MODE" == "single" ]]; then
    # Single file import
    echo ""
    echo "📥 Importing CSV data..."
    echo "   This will take 20-60 seconds..."
    echo ""

    # Set statement timeout and run import
    psql "$SUPABASE_DB_URL" <<EOF
SET statement_timeout = '$DB_STATEMENT_TIMEOUT';
\copy ip_to_country_ranges(network, continent_code, country_code, country_name, region_name, city_name) FROM '$CSV_FILE' WITH (FORMAT csv, HEADER true);
EOF

    IMPORT_END=$(date +%s)
    IMPORT_DURATION=$((IMPORT_END - IMPORT_START))

    echo ""
    echo -e "${GREEN}✓${NC} CSV imported successfully in ${IMPORT_DURATION}s"

else
    # Multi-part import with validation
    echo ""
    echo "📥 Multi-part import started (with row-level validation)..."
    echo ""

    PART_COUNT=${#PART_FILES[@]}
    PART_NUM=0
    EXPECTED_TOTAL_ROWS=0
    TOTAL_ROWS_SKIPPED=0

    # Get initial row count
    ROWS_BEFORE_IMPORT=$(psql "$SUPABASE_DB_URL" -tAc "SELECT COUNT(*) FROM ip_to_country_ranges;")
    echo -e "${BLUE}ℹ${NC}  Starting row count: $(printf "%'d" $ROWS_BEFORE_IMPORT)"
    echo ""

    for PART_FILE in "${PART_FILES[@]}"; do
        PART_NUM=$((PART_NUM + 1))
        PART_NAME=$(basename "$PART_FILE")
        PART_SIZE=$(du -h "$PART_FILE" | cut -f1)
        PART_START=$(date +%s)

        # Determine if this part has header (only part1 has header)
        if [[ "$PART_NUM" -eq 1 ]]; then
            HEADER_FLAG="true"
            HEADER_TEXT="WITH HEADER"
        else
            HEADER_FLAG="false"
            HEADER_TEXT="NO HEADER"
        fi

        # Count expected rows from file
        EXPECTED_PART_ROWS=$(wc -l < "$PART_FILE" 2>/dev/null || echo "0")
        if [[ "$PART_NUM" -eq 1 ]]; then
            # Subtract 1 for header
            EXPECTED_PART_ROWS=$((EXPECTED_PART_ROWS - 1))
        fi
        EXPECTED_TOTAL_ROWS=$((EXPECTED_TOTAL_ROWS + EXPECTED_PART_ROWS))

        echo -e "${CYAN}[$PART_NUM/$PART_COUNT]${NC} ${PART_NAME} ($PART_SIZE) $HEADER_TEXT"
        echo "   Expected rows: $(printf "%'d" $EXPECTED_PART_ROWS)"

        # Get DB row count BEFORE import
        DB_ROWS_BEFORE=$(psql "$SUPABASE_DB_URL" -tAc "SELECT COUNT(*) FROM ip_to_country_ranges;")

        # Import this part
        IMPORT_OUTPUT=$(psql "$SUPABASE_DB_URL" <<EOF 2>&1
SET statement_timeout = '$DB_STATEMENT_TIMEOUT';
\copy ip_to_country_ranges(network, continent_code, country_code, country_name, region_name, city_name) FROM '$PART_FILE' WITH (FORMAT csv, HEADER $HEADER_FLAG);
EOF
)
        IMPORT_EXIT_CODE=$?

        # Get DB row count AFTER import
        DB_ROWS_AFTER=$(psql "$SUPABASE_DB_URL" -tAc "SELECT COUNT(*) FROM ip_to_country_ranges;")
        ACTUAL_ROWS_IMPORTED=$((DB_ROWS_AFTER - DB_ROWS_BEFORE))

        # Check for psql errors
        if [[ $IMPORT_EXIT_CODE -ne 0 ]]; then
            echo -e "   ${RED}❌ FAILED - psql command returned error${NC}"
            echo ""
            echo "Import failed at part $PART_NUM of $PART_COUNT"
            echo ""
            echo "Error details:"
            echo "$IMPORT_OUTPUT"
            echo ""
            echo "Database state:"
            echo "  Rows before part: $(printf "%'d" $DB_ROWS_BEFORE)"
            echo "  Rows after part:  $(printf "%'d" $DB_ROWS_AFTER)"
            echo "  Rows imported:    $(printf "%'d" $ACTUAL_ROWS_IMPORTED)"
            exit 1
        fi

        PART_END=$(date +%s)
        PART_DURATION=$((PART_END - PART_START))

        # Compare expected vs actual (allow small threshold for rounding/duplicates)
        ROW_DIFF=$((EXPECTED_PART_ROWS - ACTUAL_ROWS_IMPORTED))
        ROW_DIFF_ABS=${ROW_DIFF#-}  # Absolute value
        VALIDATION_THRESHOLD=100

        if [[ $ROW_DIFF_ABS -gt $VALIDATION_THRESHOLD ]]; then
            echo -e "   ${RED}❌ VALIDATION FAILED - Significant row count mismatch!${NC}"
            echo ""
            echo "Part $PART_NUM ($PART_NAME) import completed but row counts don't match:"
            echo "  Expected rows:  $(printf "%'d" $EXPECTED_PART_ROWS)"
            echo "  Actually added: $(printf "%'d" $ACTUAL_ROWS_IMPORTED)"
            echo "  Difference:     $(printf "%'d" $ROW_DIFF) rows"
            echo ""
            echo "Common causes:"
            echo "  • Data validation errors (invalid CIDR format, bad characters)"
            echo "  • Constraint violations (duplicate networks, NULL values)"
            echo "  • Connection timeout during import"
            echo "  • Database disk space issues"
            echo ""
            if [[ -n "$IMPORT_OUTPUT" ]]; then
                echo "Import output:"
                echo "$IMPORT_OUTPUT"
                echo ""
            fi
            echo "Database state:"
            echo "  Rows before: $(printf "%'d" $DB_ROWS_BEFORE)"
            echo "  Rows after:  $(printf "%'d" $DB_ROWS_AFTER)"
            echo ""
            echo -e "${RED}Import stopped to prevent data corruption.${NC}"
            echo "Please investigate the issue before continuing."
            exit 1
        fi

        # Calculate rows skipped (duplicates or validation failures)
        ROWS_SKIPPED=$((ROW_DIFF))
        if [[ $ROWS_SKIPPED -gt 0 ]]; then
            TOTAL_ROWS_SKIPPED=$((TOTAL_ROWS_SKIPPED + ROWS_SKIPPED))
        fi

        # Success feedback
        echo -e "   ${GREEN}✓${NC} Imported $(printf "%'d" $ACTUAL_ROWS_IMPORTED) rows in ${PART_DURATION}s"
        if [[ $ROW_DIFF_ABS -gt 0 && $ROW_DIFF_ABS -le $VALIDATION_THRESHOLD ]]; then
            echo -e "   ${YELLOW}Note: $(printf "%'d" $ROW_DIFF_ABS) rows skipped (within acceptable threshold)${NC}"
        fi

        # Show cumulative progress from database
        ELAPSED=$((PART_END - IMPORT_START))
        CUMULATIVE_DB_ROWS=$((DB_ROWS_AFTER - ROWS_BEFORE_IMPORT))
        echo "   DB total: $(printf "%'d" $DB_ROWS_AFTER) rows (+$(printf "%'d" $CUMULATIVE_DB_ROWS) from start)"
        echo "   Time elapsed: ${ELAPSED}s"

        # Progress bar
        PERCENT=$((PART_NUM * 100 / PART_COUNT))
        BAR_LEN=$((PERCENT / 5))
        BAR=$(printf '%*s' "$BAR_LEN" | tr ' ' '█')
        SPACES=$(printf '%*s' "$((20 - BAR_LEN))" | tr ' ' '░')
        echo -e "   Progress: ${CYAN}$BAR$SPACES${NC} $PERCENT%"
        echo ""
    done

    IMPORT_END=$(date +%s)
    IMPORT_DURATION=$((IMPORT_END - IMPORT_START))

    # Final validation
    FINAL_DB_ROWS=$(psql "$SUPABASE_DB_URL" -tAc "SELECT COUNT(*) FROM ip_to_country_ranges;")
    TOTAL_IMPORTED=$((FINAL_DB_ROWS - ROWS_BEFORE_IMPORT))
    TOTAL_DIFF=$((EXPECTED_TOTAL_ROWS - TOTAL_IMPORTED))
    TOTAL_DIFF_ABS=${TOTAL_DIFF#-}

    echo -e "${GREEN}✅ All $PART_COUNT parts processed!${NC}"
    echo ""
    echo "Import Summary:"
    echo "  Expected rows:  $(printf "%'d" $EXPECTED_TOTAL_ROWS)"
    echo "  Imported rows:  $(printf "%'d" $TOTAL_IMPORTED)"
    if [[ $TOTAL_DIFF_ABS -gt 100 ]]; then
        echo -e "  ${YELLOW}⚠️  Difference:   $(printf "%'d" $TOTAL_DIFF_ABS) rows${NC}"
    else
        echo -e "  ${GREEN}✓${NC} Difference:   $(printf "%'d" $TOTAL_DIFF_ABS) rows (acceptable)"
    fi
    if [[ $TOTAL_ROWS_SKIPPED -gt 0 ]]; then
        echo "  Rows skipped:   $(printf "%'d" $TOTAL_ROWS_SKIPPED)"
    fi
    echo "  Import time:    ${IMPORT_DURATION}s"
    echo "  Avg per part:   $((IMPORT_DURATION / PART_COUNT))s"
    echo ""
fi

# ============================================================================
# 8. Rebuild Index
# ============================================================================

echo ""
echo "🔨 Rebuilding GiST index..."
echo "   This will take 60-120 seconds..."
echo ""

INDEX_START=$(date +%s)

psql "$SUPABASE_DB_URL" -c "CREATE INDEX idx_ip_range_gist ON ip_to_country_ranges USING gist (network inet_ops);" > /dev/null

INDEX_END=$(date +%s)
INDEX_DURATION=$((INDEX_END - INDEX_START))

echo -e "${GREEN}✓${NC} Index rebuilt successfully in ${INDEX_DURATION}s"

# ============================================================================
# 9. Verify Import
# ============================================================================

echo ""
echo "✅ Verifying import..."

# Get final row count
FINAL_ROWS=$(psql "$SUPABASE_DB_URL" -tAc "SELECT COUNT(*) FROM ip_to_country_ranges;")

# Test a sample query
SAMPLE_QUERY=$(psql "$SUPABASE_DB_URL" -tAc "SELECT country_code, country_name, region_name, city_name FROM find_country_by_ip('8.8.8.8');" 2>/dev/null || echo "")

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

# ============================================================================
# 10. Success Summary
# ============================================================================

echo ""
echo "============================================================================"
echo -e "  ${GREEN}✅ IMPORT SUCCESSFUL!${NC}"
echo "============================================================================"
echo ""
echo "Statistics:"
echo "  Rows imported:     $(printf "%'d" $FINAL_ROWS)"
echo "  Import time:       ${IMPORT_DURATION}s"
echo "  Index build time:  ${INDEX_DURATION}s"
echo "  Total time:        ${TOTAL_DURATION}s"
echo "  Connection type:   $CONNECTION_TYPE"
echo ""

if [[ -n "$SAMPLE_QUERY" ]]; then
    echo "Sample query test:"
    echo "  IP: 8.8.8.8"
    echo "  Result: $SAMPLE_QUERY"
    echo -e "  Status: ${GREEN}✓ Working${NC}"
else
    echo -e "Sample query test: ${YELLOW}⚠️  Warning - query failed (check find_country_by_ip function)${NC}"
fi

echo ""
echo "============================================================================"
echo ""
echo "Next steps:"
echo "  • Test IP lookup: SELECT * FROM find_country_by_ip('1.1.1.1');"
echo "  • Check analytics in Supabase Edge Functions"
echo ""
