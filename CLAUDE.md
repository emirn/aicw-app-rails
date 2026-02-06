# CLAUDE.md - aicw-app-rails (Monorepo)

## Monorepo Structure

```
aicw-app-rails/
├── apps/
│   ├── web/          # Rails 8 dashboard (port 3000 + Vite on 3036)
│   ├── sgen/         # Article generation API (port 3001)
│   ├── cli/          # CLI for local batch generation
│   └── wbuilder/     # Website builder API (port 4002)
├── packages/
│   └── types/        # Shared TypeScript types (@blogpostgen/types)
├── sample-apps/
│   ├── inspector/            # Reference: full-stack inspector app
│   └── cloudfare-website-publisher-template/  # Reference: Cloudflare Pages template
├── bin/
│   └── dev           # Start all services for development
├── package.json      # npm workspaces root
└── .github/
    └── workflows/    # CI and deployment workflows
```

## Development

```bash
# Start all services (Rails + Vite + wbuilder)
bin/dev

# Or start individual services:
cd apps/web && bin/dev          # Rails + Vite + background jobs
cd apps/wbuilder/api-server && npm run dev  # Website builder only
cd apps/sgen && npm run dev     # Article generation API only
```

### Key URLs (development)

- Dashboard: http://localhost:3000/dashboard
- Vite dev server: http://localhost:3036
- Website Builder API: http://localhost:4002
- Sgen API: http://localhost:3001

## Deployment

Push a tag matching `full-v*` (e.g., `full-v1.0.0`) to trigger the full-stack deployment workflow to AWS Lightsail via Kamal.

## Services

### Rails App (`apps/web/`)
The main dashboard application. See `apps/web/CLAUDE.md` for detailed documentation.

### Article Generation (`apps/sgen/`)
Node.js/Fastify microservice for AI article generation and enhancement. See `apps/sgen/CLAUDE.md` for details.

### CLI (`apps/cli/`)
Standalone CLI tool for batch article generation via the Sgen API. See `apps/cli/README.md` for usage.

### Website Builder (`apps/wbuilder/`)
Node.js API that builds and deploys Astro-based static sites to Cloudflare Pages. Runs on port 4002.
