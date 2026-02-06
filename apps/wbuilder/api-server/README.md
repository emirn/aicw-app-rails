# AICW Website Builder API Server

A simple API server that builds and deploys static websites to Cloudflare Pages. Uses Handlebars templates and filesystem-based job tracking.

## Features

- RESTful API for managing build jobs
- **Two build modes**: Immediate (all-at-once) or Draft (incremental uploads)
- Handlebars-based static site generation
- Support for multipart file uploads (articles + images)
- Automatic deployment to Cloudflare Pages
- Filesystem-based job storage (no database required)
- Docker containerization with Kamal 2.0 deployment
- SSL/TLS automatically provisioned via Kamal Proxy

## Quick Start

### Option 1: Local Development (No Docker)

```bash
cd api-server

# Install dependencies
npm install

# Copy local test environment
cp .env.local.example .env

# Run the server
npm run dev
```

The server will start at `http://localhost:4002`.

### Option 2: Local Development (Docker)

```bash
# From project root
docker compose up --build

# Or build and run manually
docker build -f api-server/Dockerfile -t aicw-website-builder .
docker run -p 4002:4002 \
  -e AICW_WEBSITE_BUILD_API_KEY=local-test-key-123 \
  -v $(pwd)/data:/data/aicw_wb_data \
  aicw-website-builder
```

### Deploy to AWS Lightsail

1. **Create a Lightsail instance** (Ubuntu 22.04, $12/mo plan, 2GB RAM)
2. **Setup the server**: `ssh ubuntu@YOUR_IP 'bash -s' < scripts/setup-server.sh`
3. **Configure**: Edit `.env` and `config/deploy.yml` with your values
4. **Deploy**: `gem install kamal && ./scripts/deploy.sh`

## API Endpoints

All endpoints (except `/health`) require authentication via `X-API-Key` header.

### Health Check

```http
GET /health
```

### Create Build Job

Two modes available:

**Immediate Mode** (small payloads - includes articles):
```http
POST /jobs
Content-Type: application/json

{
  "template": "default",
  "siteId": "my-blog",
  "cloudflareProjectName": "my-blog",
  "config": { "site": { "name": "My Blog" } },
  "articles": [
    { "filename": "post.md", "content": "---\ntitle: Hello\n---\n# Hello" }
  ]
}
```

**Draft Mode** (large payloads - upload articles separately):
```http
POST /jobs
Content-Type: application/json

{
  "template": "default",
  "siteId": "my-blog",
  "cloudflareProjectName": "my-blog",
  "config": { "site": { "name": "My Blog" } }
}
```

Response (draft mode):
```json
{
  "jobId": "my-blog_abc123",
  "status": "draft",
  "mode": "draft",
  "links": {
    "uploadArticle": "/jobs/my-blog_abc123/articles",
    "start": "/jobs/my-blog_abc123/start"
  }
}
```

### Upload Articles (Draft Mode)

**JSON format:**
```http
POST /jobs/:jobId/articles
Content-Type: application/json

{
  "filename": "my-article.md",
  "content": "---\ntitle: My Article\n---\n# Content here",
  "encoding": "utf8"
}
```

**Multipart format (with images):**
```http
POST /jobs/:jobId/articles
Content-Type: multipart/form-data

article: [markdown file]
images: [image files]
```

### Upload Images

```http
POST /jobs/:jobId/images
Content-Type: multipart/form-data

[image files]
```

### List Uploaded Articles

```http
GET /jobs/:jobId/articles
```

### List Uploaded Images

```http
GET /jobs/:jobId/images
```

### Delete Article

```http
DELETE /jobs/:jobId/articles/:filename
```

### Start Build (Draft Mode)

```http
POST /jobs/:jobId/start
```

### Get Job Status

```http
GET /jobs/:jobId
```

Response:
```json
{
  "status": "completed",
  "message": "Build successful",
  "url": "https://my-blog.pages.dev",
  "duration": 45230,
  "articlesCount": 10,
  "pagesCount": 2
}
```

Job statuses: `draft`, `queued`, `running`, `completed`, `failed`

### Get Job Logs

```http
GET /jobs/:jobId/logs
```

### Restart Job

```http
POST /jobs/:jobId/restart
```

### Delete Job

```http
DELETE /jobs/:jobId
```

### List All Jobs

```http
GET /jobs
```

### List Templates

```http
GET /templates
```

## Workflow Examples

### Small Site (Immediate Mode)

```bash
# Create and build in one request
curl -X POST http://localhost:4002/jobs \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "my-blog",
    "cloudflareProjectName": "my-blog",
    "articles": [
      {"filename": "post1.md", "content": "..."},
      {"filename": "post2.md", "content": "..."}
    ]
  }'
```

### Large Site (Draft Mode with Incremental Uploads)

```bash
# 1. Create draft job
JOB_ID=$(curl -s -X POST http://localhost:4002/jobs \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"siteId": "my-blog", "cloudflareProjectName": "my-blog"}' \
  | jq -r '.jobId')

# 2. Upload articles one by one
for file in articles/*.md; do
  curl -X POST "http://localhost:4002/jobs/$JOB_ID/articles" \
    -H "X-API-Key: $API_KEY" \
    -F "article=@$file"
done

# 3. Upload images
curl -X POST "http://localhost:4002/jobs/$JOB_ID/images" \
  -H "X-API-Key: $API_KEY" \
  -F "image1=@hero.jpg" \
  -F "image2=@logo.png"

# 4. Start the build
curl -X POST "http://localhost:4002/jobs/$JOB_ID/start" \
  -H "X-API-Key: $API_KEY"

# 5. Check status
curl "http://localhost:4002/jobs/$JOB_ID" -H "X-API-Key: $API_KEY"
```

## Article Format

Articles use Markdown with YAML frontmatter. The `slug` field is **required** - it defines the article URL path:

```markdown
---
slug: my-article-title
title: My Article Title
date: 2024-01-15
author: John Doe
categories:
  - Technology
tags:
  - JavaScript
excerpt: A brief description
image: /images/featured.jpg
---

# My Article

Your markdown content here...
```

**Required fields:**
- `slug` - URL path for the article (e.g., `my-article` → `/my-article/`)

## Configuration

Site configuration is merged with template defaults:

```json
{
  "site": {
    "name": "Site Name",
    "tagline": "Site tagline",
    "description": "SEO description",
    "url": "https://example.com"
  },
  "colors": {
    "primary": "#3B82F6",
    "background": "#FFFFFF"
  },
  "darkMode": {
    "enabled": true,
    "default": "dark"
  }
}
```

See `aicw-website-templates/default/config.schema.json` for full options.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AICW_WEBSITE_BUILD_API_KEY` | Yes | API authentication key |
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token (see permissions below) |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `CLOUDFLARE_AICW_ZONE_ID` | Yes | Zone ID for pgndr.com domain |
| `PORT` | No | Server port (default: 4002) |

### Cloudflare API Token Setup

Sites are deployed to Cloudflare Pages with custom subdomains under `*.sites.pgndr.com`.

**Create or update your API token at:** https://dash.cloudflare.com/profile/api-tokens

The token requires these permissions:

| Permission | Access | Purpose |
|------------|--------|---------|
| **Zone:DNS:Edit** | pgndr.com zone | Create/update CNAME records (e.g., `prod-test-blog.sites.pgndr.com`) |
| **Cloudflare Pages:Edit** | Account | Deploy sites and register custom domains |

**Zone Resources:** Limit the token to the `pgndr.com` zone only for security.

Data and templates paths are hardcoded:
- **Production (Docker)**: `/data/aicw_wb_data` and `/app/aicw-website-templates`
- **Local dev**: `./aicw_wb_data` and `../aicw-website-templates` (relative to api-server)

## Directory Structure

```
api-server/
├── src/
│   ├── server.js      # Main Fastify server
│   ├── builder.js     # Static site builder
│   └── helpers.js     # Handlebars helpers
├── config/
│   └── deploy.yml     # Kamal configuration
├── scripts/
│   ├── setup-server.sh
│   ├── deploy.sh
│   └── test-api.sh
├── Dockerfile
├── package.json
└── .env.example
```

## Job Data Structure

```
/data/aicw_wb_data/
└── my-blog_abc123/
    ├── input.json      # Job configuration
    ├── status.json     # Current status
    ├── build.log       # Build logs
    ├── articles/       # Uploaded markdown files
    ├── images/         # Uploaded images
    └── build/          # Build output (on failure)
```

## Multi-Service Deployment

The Kamal configuration is designed for safe multi-service deployment:

- Uses unique service name (`aicw-website-builder`)
- Stores data in isolated directory (`/data/aicw_wb_data/`)
- See `config/deploy.yml` for multi-service notes

## Troubleshooting

### Build fails at Cloudflare deployment

Without Cloudflare credentials, builds complete but deployment fails. You can inspect the generated site at `data/{jobId}/build/dist/`.

### Job stuck in "running" state

Check build logs: `GET /jobs/:jobId/logs`

### Cannot upload to non-draft job

Only draft jobs accept article uploads. Create a new job or delete and recreate.
