# AICW Website Builder

Dead simple Astro site builder. Uses filesystem as database - no Redis, no queues.

## How it works

```
/data/aicw-website-builder/
  └── mysite_abc123/
      ├── input.json      # Original request
      ├── status.json     # Current status
      ├── build.log       # Build logs
      └── build/          # Temp build dir (deleted after)
```

## API

```bash
# Start a build
POST /jobs
{
  "templateRepo": "github.com/user/astro-template",
  "siteId": "my-blog",
  "cloudflareProjectName": "my-blog",
  "articles": [{ "filename": "post.md", "filepath": "src/content/blog/", "content": "..." }]
}
# Returns: { "jobId": "my-blog_abc123", "status": "queued" }

# Check status
GET /jobs/:jobId
# Returns: { "status": "running|completed|failed", "message": "...", "url": "..." }

# Restart failed job
POST /jobs/:jobId/restart

# Delete job
DELETE /jobs/:jobId

# List all jobs
GET /jobs
```

## Deploy to Lightsail

```bash
# 1. Create Lightsail instance (Ubuntu, $12/mo plan - 2GB RAM is enough)

# 2. SSH in and install Docker
ssh ubuntu@YOUR_IP
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
sudo mkdir -p /data/aicw-website-builder

# 3. On your local machine, install Kamal
gem install kamal

# 4. Edit config/deploy.yml - set YOUR_LIGHTSAIL_IP

# 5. Create .env with your secrets
cp .env.example .env

# 6. Push secrets and deploy
kamal env push
kamal deploy
```

## Running multiple APIs on same server

This builder uses `/data/aicw-website-builder` for its data. Other APIs can coexist:

```
/data/
  ├── aicw-website-builder/   # This service
  ├── other-api/              # Another service
  └── ...
```

Just deploy other Kamal services to the same IP with different `service` names.

## Local dev

```bash
npm install
cp .env.example .env
# Fill in .env
node src/server.js
```

## Example: Call from Supabase Edge Function

```typescript
const response = await fetch('https://builder.yourdomain.com/jobs', {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    templateRepo: 'github.com/org/template',
    siteId: 'user-123-blog',
    cloudflareProjectName: 'user-123-blog',
    articles: [
      { filename: 'hello.md', filepath: 'src/content/blog/', content: '# Hello' }
    ]
  })
});

const { jobId } = await response.json();

// Poll for status
const status = await fetch(`https://builder.yourdomain.com/jobs/${jobId}`, {
  headers: { 'X-API-Key': API_KEY }
}).then(r => r.json());

console.log(status.url); // https://user-123-blog.pages.dev
```
