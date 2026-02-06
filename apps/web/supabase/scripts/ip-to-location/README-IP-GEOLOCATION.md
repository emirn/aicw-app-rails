# IP Geolocation Scripts

Scripts for converting and importing DB-IP City Lite data into Supabase PostgreSQL.

## Quick Start

### One-Command Import (Recommended)

```bash
cd /Users/mine/projects/ai-chat-watch/aicw-app/script/supabase

# Convert and import in one go
./convert-and-import-ip-data.sh
```

This will:
1. Convert DB-IP CSV to PostgreSQL format
2. Import data to your Supabase database

### Manual Step-by-Step

If you prefer to run each step separately:

#### 1. Convert CSV

```bash
python3 convert-dbip-to-csv-for-postgres.py \
  --input data/ip-to-location/dbip-city-lite-latest.csv.gz
```

**Output:** `data/ip-to-location/.temp/dbip-full.csv`

#### 2. Configure Database Connection

```bash
cd data/ip-to-location
cp env.local.example .env.local
nano .env.local  # Add your Supabase connection string
```

#### 3. Import to Supabase

```bash
./import-ip-geolocation.sh
```

## Scripts Overview

| Script | Purpose | Time |
|--------|---------|------|
| `convert-dbip-to-csv-for-postgres.py` | Convert DB-IP CSV to PostgreSQL format with CIDR notation | ~2-5 min |
| `import-ip-geolocation.sh` | Import converted CSV to Supabase with optimized indexing | ~2-3 min |
| `convert-and-import-ip-data.sh` | Run both conversion and import in sequence | ~5-8 min |

## Prerequisites

- Python 3.x
- PostgreSQL client (`psql`)
  ```bash
  brew install postgresql  # macOS
  ```
- DB-IP City Lite CSV downloaded
- Supabase database with migrations applied

## Configuration

Create `data/ip-to-location/.env.local`:

```bash
SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres
DB_CONNECTION_TIMEOUT=10
DB_STATEMENT_TIMEOUT=600000
```

Get connection string from:
**Supabase Dashboard → Settings → Database → Connection string → URI**

## Output

After successful import:
- **~15 million rows** in `ip_to_country_ranges` table
- **GiST index** for fast IP lookups (sub-millisecond)
- **Database size:** ~2-3 GB

## Testing

```sql
-- Test IP lookup
SELECT * FROM find_country_by_ip('8.8.8.8');

-- Expected result: US - United States (California, Mountain View)

-- Check row count
SELECT COUNT(*) FROM ip_to_country_ranges;
-- Expected: ~15,000,000
```

## Troubleshooting

### CSV File Not Found
```bash
# Download DB-IP data first
cd data/ip-to-location
curl -o dbip-city-lite-latest.csv.gz \
  "https://download.db-ip.com/free/dbip-city-lite-$(date +%Y-%m).csv.gz"
```

### Connection Error
- Check `.env.local` has correct connection string
- Use "Direct connection" URL, not pooler
- Verify Supabase project is not paused

### Table Missing
```bash
# Apply migrations
cd /Users/mine/projects/ai-chat-watch/aicw-app
npx supabase db push
```

## Complete Documentation

See [IMPORT-GUIDE.md](data/ip-to-location/IMPORT-GUIDE.md) for detailed documentation.

## Data License

**Source:** DB-IP City Lite (https://db-ip.com)  
**License:** CC BY 4.0 (Attribution required)

**Required attribution in your app:**
> This service uses IP geolocation data from [DB-IP.com](https://db-ip.com)

