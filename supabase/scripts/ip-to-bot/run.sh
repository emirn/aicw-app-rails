#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================="
echo "AI Bot IP Range Update"
echo "==================================="
echo ""

# Step 1: Download
echo "Step 1: Downloading IP ranges..."
"$SCRIPT_DIR/download-ips.sh"
echo ""

# Step 2: Convert
echo "Step 2: Converting to CSV..."
"$SCRIPT_DIR/convert-ips.py"
echo ""

# Step 3: Import
echo "Step 3: Importing to Supabase..."
"$SCRIPT_DIR/import-ips.sh"
echo ""

echo "==================================="
echo "✓ Complete!"
echo "==================================="
