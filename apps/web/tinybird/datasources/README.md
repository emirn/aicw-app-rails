# Tinybird Data Sources

Data sources define the schema and storage configuration for analytics events.

## page_views_events.datasource

Main event table storing all page view tracking data.

**Key Features:**
- **Partitioning**: By month (`toYYYYMM(timestamp)`) for efficient time-range queries
- **Sorting Key**: `(project_id, timestamp, ref_source)` optimized for project-level analytics
- **TTL**: 13-month retention for GDPR compliance
- **LowCardinality**: Used for categorical fields (browser, OS) to save storage
- **FixedString(2)**: For country codes (ISO format)

**Ingestion:**
Events are sent from Supabase Edge Function `view` via Events API:
```bash
curl -X POST "https://api.tinybird.co/v0/events?name=page_views_events" \
  -H "Authorization: Bearer $TINYBIRD_INGEST_TOKEN" \
  -d '{"id":"...","project_id":"...","timestamp":"..."}'
```

**Schema Changes:**
If you modify the schema, you must:
1. Update this .datasource file
2. Run `tb deploy datasources/page_views_events.datasource`
3. Update Edge Function to match new schema
4. Update pipes that reference changed columns
