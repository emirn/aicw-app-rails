#!/usr/bin/env bash
#
# Download IP Geolocation Data
#
# This script downloads IP-to-location data from DB-IP (City Lite edition).
# DB-IP releases monthly updates with current month's data.
#
# CACHE BEHAVIOR:
#   - Files are cached for 48 hours if size >12 bytes
#   - Use --force-download to bypass cache and force re-download
#   - Invalid files (<12 bytes) are automatically re-downloaded
#
# Usage:
#   ./download-ip-data.sh [--force-download]
#
# Output:
#   - Downloads dbip-city-lite-YYYY-MM.csv.gz to data/
#   - Renames to dbip-city-lite-latest.csv.gz for consistency
#

set -euo pipefail

# Parse command line arguments
FORCE_DOWNLOAD=false
for arg in "$@"; do
    case $arg in
        --force-download)
            FORCE_DOWNLOAD=true
            shift
            ;;
    esac
done

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DATA_DIR="${SCRIPT_DIR}/data"
OUTPUT_FILE="${DATA_DIR}/dbip-city-lite-latest.csv.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create data directory if it doesn't exist
mkdir -p "${DATA_DIR}"

log_info "Starting IP geolocation data download..."
log_info "Data directory: ${DATA_DIR}"

# Build download URL for current month
CURRENT_MONTH=$(date +%Y-%m)
DOWNLOAD_URL="https://download.db-ip.com/free/dbip-city-lite-${CURRENT_MONTH}.csv.gz"

# ========================================================================
# Cache Validation (48 hours, >12 bytes)
# ========================================================================
if [[ -f "${OUTPUT_FILE}" ]] && [[ "${FORCE_DOWNLOAD}" == false ]]; then
    # Get file size (cross-platform: macOS uses -f, Linux uses -c)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        FILE_SIZE=$(stat -f %z "${OUTPUT_FILE}" 2>/dev/null || echo "0")
        FILE_MTIME=$(stat -f %m "${OUTPUT_FILE}" 2>/dev/null || echo "0")
    else
        FILE_SIZE=$(stat -c %s "${OUTPUT_FILE}" 2>/dev/null || echo "0")
        FILE_MTIME=$(stat -c %Y "${OUTPUT_FILE}" 2>/dev/null || echo "0")
    fi

    # Calculate file age in hours
    CURRENT_TIME=$(date +%s)
    AGE_SECONDS=$((CURRENT_TIME - FILE_MTIME))
    AGE_HOURS=$((AGE_SECONDS / 3600))

    # Validate: size >12 bytes AND age <48 hours
    if [[ $FILE_SIZE -gt 12 ]] && [[ $AGE_HOURS -lt 48 ]]; then
        FILE_SIZE_MB=$(( FILE_SIZE / 1024 / 1024 ))
        log_success "Using cached DB-IP data (${AGE_HOURS}h old, ${FILE_SIZE_MB}MB)"
        log_info "To force re-download, use: ./download-ip-data.sh --force-download"
        exit 0
    else
        if [[ $FILE_SIZE -le 12 ]]; then
            log_warning "Cache invalid (file too small: ${FILE_SIZE} bytes)"
        else
            log_info "Cache expired (${AGE_HOURS}h old, limit: 48h)"
        fi
    fi
fi

# Download the file
log_info "Downloading DB-IP City Lite data for ${CURRENT_MONTH}..."
log_info "URL: ${DOWNLOAD_URL}"
log_info "Output: ${OUTPUT_FILE}"

# Download with progress bar and error handling
HTTP_CODE=$(curl -L -# -w "%{http_code}" -o "${OUTPUT_FILE}" "${DOWNLOAD_URL}" || echo "000")

if [[ "${HTTP_CODE}" == "200" ]]; then
    # Validate the downloaded file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        FILE_SIZE=$(stat -f %z "${OUTPUT_FILE}" 2>/dev/null || echo "0")
    else
        FILE_SIZE=$(stat -c %s "${OUTPUT_FILE}" 2>/dev/null || echo "0")
    fi

    if [[ $FILE_SIZE -gt 12 ]]; then
        FILE_SIZE_MB=$(( FILE_SIZE / 1024 / 1024 ))
        log_success "Download complete (${FILE_SIZE_MB}MB)"

        # Verify it's a valid gzip file
        if gunzip -t "${OUTPUT_FILE}" 2>/dev/null; then
            log_success "File validation passed - valid gzip archive"
        else
            log_error "File validation failed - corrupted gzip file"
            rm -f "${OUTPUT_FILE}"
            exit 1
        fi
    else
        log_error "Download failed - file too small (${FILE_SIZE} bytes)"
        rm -f "${OUTPUT_FILE}"
        exit 1
    fi
else
    log_error "Download failed with HTTP code: ${HTTP_CODE}"
    log_error "The file for ${CURRENT_MONTH} may not be available yet."
    log_error "Try downloading the previous month's data manually from:"
    log_error "  https://db-ip.com/db/download/ip-to-city-lite"
    rm -f "${OUTPUT_FILE}"
    exit 1
fi

log_success "IP geolocation data download complete!"
