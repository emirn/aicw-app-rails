#!/bin/bash

# Test Tinybird pipes with a test project ID
# Usage: ./test-pipes.sh <project_id>

PROJECT_ID=${1:-"test-project-id"}

if [ -z "$TINYBIRD_API_TOKEN" ]; then
    echo "❌ TINYBIRD_API_TOKEN environment variable not set"
    echo "   Get it from Tinybird UI > Tokens > analytics_read token"
    exit 1
fi

TINYBIRD_API_URL=${TINYBIRD_API_URL:-"https://api.us-east.aws.tinybird.co"}

echo "🧪 Testing Tinybird Pipes with project_id: $PROJECT_ID"
echo ""

# Test analytics_overview
echo "1️⃣  Testing analytics_overview..."
curl -s "$TINYBIRD_API_URL/v0/pipes/analytics_overview.json?project_id=$PROJECT_ID" \
  -H "Authorization: Bearer $TINYBIRD_API_TOKEN" | jq '.' || echo "  ❌ Failed"
echo ""

# Test ai_sources_breakdown
echo "2️⃣  Testing ai_sources_breakdown..."
curl -s "$TINYBIRD_API_URL/v0/pipes/ai_sources_breakdown.json?project_id=$PROJECT_ID" \
  -H "Authorization: Bearer $TINYBIRD_API_TOKEN" | jq '.' || echo "  ❌ Failed"
echo ""

# Test ai_visits_timeseries
echo "3️⃣  Testing ai_visits_timeseries..."
curl -s "$TINYBIRD_API_URL/v0/pipes/ai_visits_timeseries.json?project_id=$PROJECT_ID&interval=day" \
  -H "Authorization: Bearer $TINYBIRD_API_TOKEN" | jq '.' || echo "  ❌ Failed"
echo ""

# Test ai_visits_geo
echo "4️⃣  Testing ai_visits_geo..."
curl -s "$TINYBIRD_API_URL/v0/pipes/ai_visits_geo.json?project_id=$PROJECT_ID&limit=10" \
  -H "Authorization: Bearer $TINYBIRD_API_TOKEN" | jq '.' || echo "  ❌ Failed"
echo ""

# Test top_pages
echo "5️⃣  Testing top_pages..."
curl -s "$TINYBIRD_API_URL/v0/pipes/top_pages.json?project_id=$PROJECT_ID&limit=10" \
  -H "Authorization: Bearer $TINYBIRD_API_TOKEN" | jq '.' || echo "  ❌ Failed"
echo ""

# Test traffic_sources
echo "6️⃣  Testing traffic_sources..."
curl -s "$TINYBIRD_API_URL/v0/pipes/traffic_sources.json?project_id=$PROJECT_ID" \
  -H "Authorization: Bearer $TINYBIRD_API_TOKEN" | jq '.' || echo "  ❌ Failed"
echo ""

echo "✅ All pipe tests complete!"
