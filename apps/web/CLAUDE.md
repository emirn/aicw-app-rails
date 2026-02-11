# CLAUDE.md - aicw-app-rails (Rails App)

> **Monorepo note:** This is the Rails app inside the `apps/web/` directory of the aicw-app-rails monorepo. For the full monorepo overview, see the root `CLAUDE.md`. To start all services, run `bin/dev` from the **repo root**.

This is the Rails 8 version of the AI Chat Watch dashboard application.

## Overview

This app is a **standalone service** using SQLite for local data storage. It provides:
- **User Authentication**: Devise + Google OAuth
- **Project Management**: Create and manage projects with tracking IDs
- **Website Builder**: Create and deploy blog websites to Cloudflare Pages
- **Analytics Proxy**: Proxies requests to Tinybird for traffic analytics

## Architecture

| Component | Technology |
|-----------|------------|
| Backend | Rails 8 |
| Database | SQLite (local) |
| Auth | Devise + OmniAuth Google |
| Frontend | React 19 via Vite Ruby |
| Analytics Data | Tinybird |
| Background Jobs | Solid Queue |
| Deployment | Cloudflare Pages (via aicw-website-builder) |

## Development

### Setup

```bash
# Install dependencies
bundle install
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your secrets

# Create database and run migrations
bin/rails db:create db:migrate

# Seed subscription plans
bin/rails db:seed

# Start development server
bin/dev
```

### Environment Variables (Development)

Required:
- `TINYBIRD_API_KEY` - Tinybird API token
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
- `WEBSITE_BUILDER_URL` - URL to aicw-website-builder API
- `WEBSITE_BUILDER_API_KEY` - API key for website builder

Optional (production):
- `DATABASE_PATH` - Custom path for production database (default: storage/production.sqlite3)

### Deployment Environment Variables

All deployment env vars are configured in GitHub repo settings and wired through `.github/workflows/deploy-full-stack.yml` into Kamal's `deploy.yml`.

#### GitHub Repository Variables (Settings > Variables > Actions)

Non-sensitive configuration values (visible in logs).

| Variable | Value / Example | Purpose |
|---|---|---|
| `AICW_RAILS_SERVER_IP` | `1.2.3.4` | Lightsail server IP |
| `AICW_RAILS_DOMAIN` | `app.aicw.io` | Production domain (SSL cert + proxy) |
| `AICW_RAILS_DEPLOY_USERNAME` | `ubuntu` | SSH user for Kamal deploy |
| `CLOUDFLARE_ACCOUNT_ID` | `abc123...` | Cloudflare account ID (website builder) |
| `CLOUDFLARE_AICW_ZONE_ID` | `def456...` | Cloudflare zone ID for aicw.io DNS |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase project URL (analytics sync) |
| `AICW_EXCEPTION_RECIPIENTS` | `you@example.com` | Comma-separated emails for exception alerts |

#### GitHub Repository Secrets (Settings > Secrets > Actions)

Sensitive values (masked in logs).

| Secret | Source | Purpose |
|---|---|---|
| `AICW_RAILS_DEPLOY_SSH_PRIVATE_KEY` | SSH key for server | Kamal SSH access |
| `SECRET_KEY_BASE` | `bin/rails secret` | Rails cookie/session signing |
| `RAILS_MASTER_KEY` | `config/master.key` | Decrypt Rails credentials |
| `GOOGLE_CLIENT_ID` | Google Cloud Console | OAuth login |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | OAuth login |
| `TINYBIRD_API_KEY` | Tinybird dashboard | Analytics queries |
| `WEBSITE_BUILDER_API_KEY` | Self-generated shared key | Auth between Rails and website-builder |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard | Pages deployment + DNS |
| `OPENROUTER_API_KEY` | OpenRouter dashboard | AI model access (sgen) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard | Backend project sync |
| `SMTP_USERNAME` | AWS SES (IAM SMTP creds) | Email delivery |
| `SMTP_PASSWORD` | AWS SES (IAM SMTP creds) | Email delivery |

Note: `GITHUB_TOKEN` is provided automatically by GitHub Actions — no setup needed.

#### Hardcoded in deploy.yml (no config needed)

These are set directly in `apps/web/deployment/full-stack/config/deploy.yml`:

- `RAILS_ENV=production`, `RAILS_LOG_TO_STDOUT=true`, `RAILS_SERVE_STATIC_FILES=true`, `SOLID_QUEUE_IN_PUMA=true`
- `WEBSITE_BUILDER_URL` / `SGEN_SERVICE_URL` — Docker-internal URLs
- `TINYBIRD_API_URL` — EU region endpoint
- `SMTP_SERVER` — AWS SES endpoint (`email-smtp.us-east-1.amazonaws.com`)
- `PORT` / `NODE_ENV` — for sgen and website-builder accessories

### Key URLs

- Dashboard: http://localhost:3000/dashboard
- API: http://localhost:3000/api/v1/
- Vite Dev Server: http://localhost:3036

## Database

This app uses **SQLite** with all tables created via Rails migrations:
- `users` - User accounts with Devise authentication
- `accounts` - Multi-tenancy accounts
- `account_users` - Account membership (join table)
- `projects` - Projects with tracking_id, domain
- `subscriptions`, `subscription_plans` - Subscription management
- `project_websites`, `website_articles`, `website_deployments` - Website builder
- `visibility_checks`, `project_ranking_configs` - Analytics features
- `api_tokens` - API authentication tokens

Database files are stored in `storage/` directory.

## Data Sync with Supabase

For analytics, project data can be manually synced to Supabase:
1. Export projects from Rails: `Project.all.as_json`
2. Import to Supabase via dashboard or REST API
3. Fields to sync: `domain`, `name`, `tracking_id`, `enable_public_page`

## API Endpoints

### Authentication
- `GET /api/v1/me` - Current user info

### Projects
- `GET /api/v1/projects` - List user's projects
- `GET /api/v1/projects/:id` - Project details
- `POST /api/v1/projects` - Create project
- `PATCH /api/v1/projects/:id` - Update project
- `DELETE /api/v1/projects/:id` - Delete project

### Analytics
- `POST /api/v1/projects/:project_id/analytics/query` - Query Tinybird
- `POST /api/v1/analytics/public` - Public analytics (for enable_public_page projects)

### Website Builder
- `GET /api/v1/projects/:project_id/website` - Get website
- `POST /api/v1/projects/:project_id/website` - Create website
- `PATCH /api/v1/projects/:project_id/website` - Update website
- `POST /api/v1/projects/:project_id/website/deploy` - Deploy website

### Articles (IArticle interface from blogpostgen)
- `GET /api/v1/websites/:website_id/articles` - List articles
- `POST /api/v1/websites/:website_id/articles` - Create article
- `POST /api/v1/websites/:website_id/articles/import` - Import article with assets (base64 encoded)
- `PATCH /api/v1/websites/:website_id/articles/:id` - Update article
- `DELETE /api/v1/websites/:website_id/articles/:id` - Delete article

Article fields match IArticle interface: title, description, keywords[], content, last_pipeline, applied_actions[], image_hero, image_og, faq, jsonld, internal_links[], published_at, slug

## File Structure

```
app/
├── controllers/
│   ├── api/
│   │   ├── base_controller.rb
│   │   └── v1/
│   │       ├── analytics_controller.rb
│   │       ├── projects_controller.rb
│   │       ├── project_websites_controller.rb
│   │       ├── website_articles_controller.rb
│   │       └── website_deployments_controller.rb
│   ├── dashboard_controller.rb
│   └── pages_controller.rb
├── frontend/               # React app (Vite Ruby)
│   ├── entrypoints/
│   │   └── application.tsx
│   └── src/
│       ├── App.tsx
│       ├── components/
│       ├── hooks/
│       └── lib/
├── jobs/
│   └── website_deployment_job.rb
├── models/
│   ├── api_token.rb
│   ├── project.rb
│   ├── project_website.rb
│   ├── subscription.rb
│   ├── user.rb
│   ├── visibility_check.rb
│   ├── website_article.rb
│   └── website_deployment.rb
├── policies/
│   └── project_policy.rb
└── services/
    ├── tinybird_client.rb
    └── website_deployment_service.rb
```

## SQLite Configuration

SQLite is configured for optimal performance in `config/initializers/sqlite_config.rb`:
- WAL journal mode for concurrency
- Foreign keys enforced
- 20MB cache with memory-mapped I/O
- 5 second busy timeout
