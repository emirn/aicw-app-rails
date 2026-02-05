# Tinybird Pipes

Pipes are SQL queries exposed as REST API endpoints. Each pipe becomes a high-performance analytics API.

## Available Pipes

### 1. analytics_overview.pipe
**Purpose**: Main dashboard statistics
**Endpoint**: `/v0/pipes/analytics_overview.json`
**Parameters**:
- `project_id` (required): UUID of the project
- `start_date` (optional): ISO 8601 datetime
- `end_date` (optional): ISO 8601 datetime

**Returns**: Total visits, AI visits, AI percentage, top AI source, unique sessions, countries, pages

### 2. ai_sources_breakdown.pipe
**Purpose**: AI source distribution
**Endpoint**: `/v0/pipes/ai_sources_breakdown.json`
**Parameters**: Same as analytics_overview
**Returns**: List of AI sources with visit counts, percentages, unique sessions

### 3. ai_visits_timeseries.pipe
**Purpose**: Time-series chart data
**Endpoint**: `/v0/pipes/ai_visits_timeseries.json`
**Parameters**:
- `project_id` (required)
- `start_date` (optional)
- `end_date` (optional)
- `interval` (optional): 'day' (default), 'week', 'month'

**Returns**: Date buckets with total visits, AI visits, AI percentage, sessions

### 4. ai_visits_geo.pipe
**Purpose**: Geographic distribution
**Endpoint**: `/v0/pipes/ai_visits_geo.json`
**Parameters**:
- `project_id` (required)
- `start_date` (optional)
- `end_date` (optional)
- `ref_source_filter` (optional): Filter by specific AI source (UInt8)
- `limit` (optional): Max results (default: 100)

**Returns**: Countries with visit counts, percentages, unique sessions

### 5. top_pages.pipe
**Purpose**: Pages ranked by AI traffic
**Endpoint**: `/v0/pipes/top_pages.json`
**Parameters**:
- `project_id` (required)
- `start_date` (optional)
- `end_date` (optional)
- `limit` (optional): Max results (default: 20)

**Returns**: Pages with total visits, AI visits, AI percentage, top AI source

### 6. traffic_sources.pipe
**Purpose**: Traffic source categorization (AI vs search vs direct vs referral)
**Endpoint**: `/v0/pipes/traffic_sources.json`
**Parameters**: Same as analytics_overview
**Returns**: Categories with visit counts, percentages, unique sessions

## Usage

**Direct API Call:**
```bash
curl "https://api.tinybird.co/v0/pipes/analytics_overview.json?project_id=<UUID>" \
  -H "Authorization: Bearer $TINYBIRD_API_TOKEN"
```

**Via Supabase Edge Function (Production):**
```typescript
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/analytics`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pipe: 'analytics_overview',
      params: { project_id: 'uuid-here' }
    })
  }
);
```

## Modifying Pipes

1. Edit the .pipe file
2. Test locally: `tb --cloud pipe data <pipe_name> --param project_id=test-uuid`
3. Deploy: `./script/tinybird/deploy.sh` (uses `tb --cloud deploy`)
4. Verify: `./script/tinybird/test-pipes.sh <real-project-id>`

**Note:** The legacy `tb push` command is deprecated. Always use `tb --cloud deploy`.

## Authentication

All pipes use the `analytics_read` token for authorization. This token is stored in environment variables and should never be exposed to the client.
