# Tinybird Analytics Infrastructure

This directory contains all Tinybird (ClickHouse) resources for AI Chat Watch analytics.

## Directory Structure

- `/datasources` - Data source schema definitions (.datasource files)
- `/pipes` - SQL queries exposed as API endpoints (.pipe files)
- `/shared` - Shared constants and types
- `/scripts` - Deployment and validation scripts

## Setup

### Prerequisites

1. Install Tinybird CLI:
```bash
pip install tinybird-cli
```

2. Authenticate:
```bash
tb auth
```

3. Set environment variables in `.env`:
```
TINYBIRD_API_URL=https://api.tinybird.co
TINYBIRD_INGEST_TOKEN=<your_datasource_append_token>
TINYBIRD_API_TOKEN=<your_pipe_read_token>
```

## Deployment

Deploy all resources:
```bash
cd tinybird
./script/deploy.sh
```

Or deploy individual resources:
```bash
tb push datasources/page_views_events.datasource
tb push pipes/analytics_overview.pipe
```

## Testing

Test a pipe locally:
```bash
tb pipe data analytics_overview --param project_id=test-uuid
```

Query via API:
```bash
curl "https://api.tinybird.co/v0/pipes/analytics_overview.json?project_id=test-uuid" \
  -H "Authorization: Bearer $TINYBIRD_API_TOKEN"
```

## Architecture

- **Data Ingestion**: Supabase Edge Function `/view` writes events to Tinybird Events API
- **Authentication**: Edge Function proxy validates project ownership before querying pipes
- **Analytics Queries**: Frontend → Supabase Edge Function → Tinybird Pipes → ClickHouse
- **Privacy**: Session hashing done server-side, daily salt rotation maintained in Supabase

## Migration Notes

- Migrated from Supabase PostgreSQL analytics to Tinybird ClickHouse
- No historical data migration - fresh start from deployment date
- Supabase still handles: auth, projects, subscriptions, billing counters
- Tinybird handles: all page view events and analytics queries
