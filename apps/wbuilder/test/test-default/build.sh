#!/bin/bash
# Build script for testing the default template
# Usage: ./build.sh [--deploy]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_SERVER="$PROJECT_ROOT/api-server"
TEMPLATE_DIR="$PROJECT_ROOT/aicw-website-templates/default"

echo "=== Test Default Template Build ==="
echo "Script dir: $SCRIPT_DIR"
echo "Template: $TEMPLATE_DIR"

# Check if API server is running, or use direct build
if [ "$1" == "--api" ]; then
    # Use API server
    API_URL="${API_URL:-http://localhost:4002}"
    API_KEY="${AICW_WEBSITE_BUILD_API_KEY:-local-test-key-123}"

    echo ""
    echo "Using API server at $API_URL"

    # Create job
    echo "Creating build job..."
    RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d @- <<EOF
{
  "template": "default",
  "siteId": "test-default",
  "cloudflareProjectName": "test-default-template",
  "config": $(cat "$SCRIPT_DIR/site-config.json")
}
EOF
)

    JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId')
    echo "Job ID: $JOB_ID"

    # Upload articles
    for article in "$SCRIPT_DIR/articles"/*.json; do
        filename=$(basename "$article")
        echo "Uploading $filename..."
        curl -s -X POST "$API_URL/jobs/$JOB_ID/articles" \
            -H "X-API-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            -d @"$article"
    done

    # Start build
    echo "Starting build..."
    curl -s -X POST "$API_URL/jobs/$JOB_ID/start" \
        -H "X-API-Key: $API_KEY"

    # Poll for completion
    echo "Waiting for build to complete..."
    while true; do
        STATUS=$(curl -s "$API_URL/jobs/$JOB_ID" -H "X-API-Key: $API_KEY" | jq -r '.status')
        echo "  Status: $STATUS"

        if [ "$STATUS" == "completed" ]; then
            echo "Build completed!"
            curl -s "$API_URL/jobs/$JOB_ID" -H "X-API-Key: $API_KEY" | jq
            break
        elif [ "$STATUS" == "failed" ]; then
            echo "Build failed!"
            curl -s "$API_URL/jobs/$JOB_ID/logs" -H "X-API-Key: $API_KEY"
            exit 1
        fi

        sleep 3
    done
else
    # Direct build using Node.js
    echo ""
    echo "Building directly (no API server)..."

    BUILD_DIR="$SCRIPT_DIR/build"
    WORK_DIR="$SCRIPT_DIR/.astro-work"

    # Clean previous builds
    rm -rf "$BUILD_DIR" "$WORK_DIR"

    # Copy template (excluding node_modules)
    echo "Copying template..."
    mkdir -p "$WORK_DIR"
    rsync -a --exclude='node_modules' "$TEMPLATE_DIR/" "$WORK_DIR/"

    # Create data directory and copy config
    mkdir -p "$WORK_DIR/data"
    cp "$SCRIPT_DIR/site-config.json" "$WORK_DIR/data/site-config.json"

    # Create articles directory
    mkdir -p "$WORK_DIR/src/content/articles"

    # Convert JSON articles to MDX
    echo "Processing articles..."
    for article in "$SCRIPT_DIR/articles"/*.json; do
        filename=$(basename "$article" .json)
        echo "  Processing $filename..."

        # Use Node.js to convert JSON to MDX
        node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$article', 'utf8'));

const frontmatter = {
    title: data.meta.title,
    description: data.meta.description,
    date: data.meta.date,
    author: data.meta.author,
    categories: data.meta.categories || [],
    keywords: data.meta.keywords || [],
    image_hero: data.meta.image_hero
};

const yaml = Object.entries(frontmatter)
    .filter(([k, v]) => v !== undefined)
    .map(([k, v]) => \`\${k}: \${JSON.stringify(v)}\`)
    .join('\n');

const mdx = \`---
\${yaml}
---

\${data.content}
\`;

fs.writeFileSync('$WORK_DIR/src/content/articles/${filename}.md', mdx);
"
    done

    # Install dependencies
    echo "Installing dependencies..."
    cd "$WORK_DIR"
    npm install
    cd "$SCRIPT_DIR"

    # Build
    echo "Running Astro build..."
    cd "$WORK_DIR"
    npm run build

    # Copy output
    echo "Copying build output..."
    cp -r "$WORK_DIR/dist" "$BUILD_DIR"

    echo ""
    echo "=== Build Complete ==="
    echo "Output: $BUILD_DIR"
    echo ""
    echo "To preview locally:"
    echo "  cd $BUILD_DIR && npx serve"
    echo ""
    echo "To test specific features:"
    echo "  - Categories: $BUILD_DIR/category/technology/index.html"
    echo "  - Categories index: $BUILD_DIR/categories/index.html"
    echo "  - llms.txt: $BUILD_DIR/llms.txt"
    echo "  - Search: Open any page and press Cmd+K"
fi
