#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_SOURCES="$SCRIPT_DIR/../../../supabase/functions/_shared/bot-sources.json"
DATA_DIR="$SCRIPT_DIR/data/crawler-ips"
CACHE_HOURS=48

mkdir -p "$DATA_DIR"

echo "Downloading IP ranges from bot sources..."

# Extract bots with ip_ranges_url and download each
jq -r '.[] | select(.ip_ranges_url != null) | "\(.name)|\(.ip_ranges_url)"' "$BOT_SOURCES" | while IFS='|' read -r name url; do
  # Create safe filename from bot name
  filename=$(echo "$name" | tr ' ' '-' | tr '[:upper:]' '[:lower:]').json
  filepath="$DATA_DIR/$filename"

  # Check if file exists and is less than CACHE_HOURS old
  if [[ -f "$filepath" ]]; then
    age_hours=$(( ($(date +%s) - $(stat -f %m "$filepath" 2>/dev/null || stat -c %Y "$filepath")) / 3600 ))
    if [[ $age_hours -lt $CACHE_HOURS ]]; then
      echo "✓ $name (cached, ${age_hours}h old)"
      continue
    fi
  fi

  # Download the file
  echo "↓ $name from $url"
  if curl -sSL --fail --max-time 30 "$url" -o "$filepath"; then
    echo "  Downloaded $(wc -c < "$filepath" | tr -d ' ') bytes"
  else
    echo "  ✗ Failed to download"
    rm -f "$filepath"
  fi
done

echo ""
echo "Downloaded IP ranges:"
ls -lh "$DATA_DIR" | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}'
