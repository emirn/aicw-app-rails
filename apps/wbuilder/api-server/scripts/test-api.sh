#!/bin/bash
# Test the API server locally
# Usage: ./scripts/test-api.sh

API_URL="${API_URL:-http://localhost:4002}"
API_KEY="${AICW_WEBSITE_BUILD_API_KEY:-local-test-key-123}"

echo "=== AICW Website Builder API - Local Test ==="
echo "API URL: $API_URL"
echo ""

# 1. Health check (no auth required)
echo "1. Testing health endpoint..."
curl -s "$API_URL/health" | jq .
echo ""

# 2. List templates
echo "2. Listing available templates..."
curl -s -H "X-API-Key: $API_KEY" "$API_URL/templates" | jq .
echo ""

# 3. Create a test job
echo "3. Creating test build job..."
JOB_RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "template": "default",
    "siteId": "test-site",
    "cloudflareProjectName": "test-site-local",
    "config": {
      "site": {
        "name": "Test Blog",
        "tagline": "A test blog for local development",
        "description": "Testing the AICW Website Builder API",
        "url": "https://test-site.pages.dev"
      },
      "colors": {
        "primary": "#10B981"
      }
    },
    "articles": [
      {
        "filename": "hello-world.md",
        "content": "---\ntitle: Hello World\nslug: hello-world\ndate: 2024-01-15\nauthor: Test Author\nexcerpt: This is a test article\n---\n\n# Hello World\n\nThis is my first test article!\n\n## Features\n\n- Markdown support\n- Frontmatter parsing\n- Automatic excerpts\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit."
      },
      {
        "filename": "second-post.md",
        "content": "---\ntitle: Second Post\nslug: second-post\ndate: 2024-01-16\nauthor: Test Author\ncategories:\n  - Technology\ntags:\n  - testing\n---\n\n# Second Post\n\nAnother test article to verify pagination and related posts.\n\n## Code Example\n\n```javascript\nconsole.log(\"Hello from the API!\");\n```"
      }
    ]
  }')

echo "$JOB_RESPONSE" | jq .
JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.jobId')
echo ""

if [ "$JOB_ID" != "null" ] && [ -n "$JOB_ID" ]; then
  # 4. Check job status
  echo "4. Checking job status (jobId: $JOB_ID)..."
  sleep 2
  curl -s -H "X-API-Key: $API_KEY" "$API_URL/jobs/$JOB_ID" | jq .
  echo ""

  # 5. Get job logs
  echo "5. Getting job logs..."
  curl -s -H "X-API-Key: $API_KEY" "$API_URL/jobs/$JOB_ID/logs" | jq .
  echo ""

  # 6. List all jobs
  echo "6. Listing all jobs..."
  curl -s -H "X-API-Key: $API_KEY" "$API_URL/jobs" | jq '.jobs[:3]'
  echo ""

  # Wait for build to complete and check again
  echo "7. Waiting 5s for build to complete..."
  sleep 5
  curl -s -H "X-API-Key: $API_KEY" "$API_URL/jobs/$JOB_ID" | jq .
  echo ""
fi

echo "=== Test Complete ==="
echo ""
echo "Note: Without Cloudflare credentials, the job will fail at the deploy step."
echo "The build output can be found in: ./aicw_wb_data/$JOB_ID/"
