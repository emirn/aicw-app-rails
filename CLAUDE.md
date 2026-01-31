# CLAUDE.md - aicw-app-rails

This is the Rails 8 version of the AI Chat Watch dashboard application.

## Overview

This app connects directly to the **existing Supabase PostgreSQL database** used by aicw-app. It provides:
- **Analytics Dashboard**: Proxies requests to Tinybird for traffic analytics
- **Website Builder**: Create and deploy blog websites to Cloudflare Pages

## Architecture

| Component | Technology |
|-----------|------------|
| Backend | Rails 8 |
| Database | Supabase PostgreSQL (existing) |
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
# Edit .env with your Supabase DATABASE_URL and other secrets

# Run migrations (only adds Devise columns and api_tokens table)
bin/rails db:migrate

# Start development server
bin/dev
```

### Environment Variables

Required:
- `SUPABASE_DATABASE_URL` - PostgreSQL connection string from Supabase
- `TINYBIRD_API_KEY` - Tinybird API token
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
- `WEBSITE_BUILDER_URL` - URL to aicw-website-builder API
- `WEBSITE_BUILDER_API_KEY` - API key for website builder

### Key URLs

- Dashboard: http://localhost:3000/dashboard
- API: http://localhost:3000/api/v1/
- Vite Dev Server: http://localhost:3036

## Database

**Important**: This app connects to the EXISTING Supabase database. Most tables already exist:
- `users`, `projects`, `subscriptions`, `subscription_plans`
- `visibility_checks`, `project_ranking_config`
- `project_websites`, `website_articles`, `website_deployments`

Only new tables:
- `api_tokens` - Rails API authentication tokens

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

### Articles
- `GET /api/v1/websites/:website_id/articles` - List articles
- `POST /api/v1/websites/:website_id/articles` - Create article
- `PATCH /api/v1/websites/:website_id/articles/:id` - Update article
- `DELETE /api/v1/websites/:website_id/articles/:id` - Delete article

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

## Parallel Operation

This Rails app can run alongside the existing React aicw-app:
- Both connect to the same Supabase database
- Users can access features via either app
- Tracking script (Supabase Edge Function) remains unchanged
