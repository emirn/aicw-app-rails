#!/usr/bin/env bash
#
# Update All IP Tables
#
# Runs both IP-to-location and IP-to-crawler updates sequentially.
# Forwards all flags to both scripts (--force-download, --auto-confirm).
#
# Usage:
#   ./update-ip-tables.sh [--force-download] [--auto-confirm]
#

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Update IP-to-Location
"${SCRIPT_DIR}/../ip-to-location/run-download-and-import.sh" "$@" || exit 1

# Update IP-to-Bot
"${SCRIPT_DIR}/../ip-to-bot/run.sh" "$@" || exit 2

echo "All IP tables updated successfully"
