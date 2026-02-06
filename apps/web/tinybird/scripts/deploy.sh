#!/bin/bash
set -e

echo "🚀 Deploying Tinybird resources..."
echo ""

# Get the script's directory and navigate to tinybird folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../../tinybird" || {
    echo "❌ Failed to navigate to tinybird directory"
    exit 1
}

# Check if tb CLI is installed
TB_CMD="tb"
if ! command -v "$TB_CMD" &> /dev/null; then
    echo "❌ Tinybird CLI not found at $TB_CMD"
    echo "   Install it with: pip install tinybird-cli"
    echo "   Or use: uv tool install tinybird-cli"
    exit 1
fi

# Check if authenticated (using --cloud flag)
if ! "$TB_CMD" --cloud workspace ls &> /dev/null; then
    echo "❌ Not authenticated with Tinybird. Please run:"
    echo "   $TB_CMD auth"
    exit 1
fi

echo "📦 Deploying all Tinybird resources (datasources & pipes)..."
"$TB_CMD" --cloud deploy --allow-destructive-operations --wait
echo "✅ All resources deployed"
echo ""

echo "🔍 Verifying deployment..."
"$TB_CMD" --cloud datasource ls | grep "page_views_events" && echo "  ✓ Datasource found"
"$TB_CMD" --cloud pipe ls | grep "analytics_overview" && echo "  ✓ Pipes found"
echo ""

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Set environment variables in Supabase Edge Functions:"
echo "   TINYBIRD_API_URL=https://api.us-east.aws.tinybird.co"
echo "   TINYBIRD_INGEST_TOKEN=<your ingest token>"
echo "   TINYBIRD_API_TOKEN=<your analytics_read token>"
echo ""
echo "2. Deploy Edge Functions:"
echo "   npx supabase functions deploy analytics"
echo "   npx supabase functions deploy analytics-public"
echo "   npx supabase functions deploy view"
echo ""
echo "3. Test a pipe:"
echo "   tb pipe data analytics_overview --param project_id=test-uuid"
