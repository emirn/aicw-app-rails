# IPv6 Connection Issues - Quick Fix

## Problem

Seeing this error when connecting to Supabase?

```
❌ Port 5432 is not reachable
❌ Cannot connect to database
```

**Root cause:** Your network doesn't support IPv6, but Supabase direct connections require IPv6.

---

## ✅ Solution: Use Connection Pooler

The connection pooler works on **both IPv4 and IPv6** networks.

### Step 1: Get Pooler Connection String

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings → Database**
4. Find "**Connection pooling**" section
5. Copy the "**Session mode**" connection string

It will look like:
```
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Examples by region:
- **EU**: `aws-0-eu-central-1.pooler.supabase.com`
- **US East**: `aws-0-us-east-1.pooler.supabase.com`
- **US West**: `aws-0-us-west-1.pooler.supabase.com`
- **Asia**: `aws-0-ap-southeast-1.pooler.supabase.com`

### Step 2: Update Configuration

Edit `.env.local`:

```bash
cd script/supabase
cp .env.local.example .env.local
nano .env.local
```

Replace with your pooler connection string:

```bash
# OLD (doesn't work on IPv4-only networks)
SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres

# NEW (works everywhere)
SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

### Step 3: Test Connection

```bash
psql "$SUPABASE_DB_URL" -c "SELECT version();"
```

Should output:
```
✓ Connection successful
  PostgreSQL: PostgreSQL 15.6
```

---

## Why This Happens

Since January 2024, Supabase direct connections (`db.*.supabase.co`) use **IPv6-only**.

Many networks don't support IPv6 yet:
- Home ISPs
- Corporate networks
- Some cloud providers (Vercel, Railway, Render)
- Mobile networks

Supabase provides the **connection pooler** (Supavisor) as an IPv4-compatible alternative.

---

## Connection Methods Comparison

| Method | Port | IPv4 | IPv6 | Use Case |
|--------|------|------|------|----------|
| **Direct** | 5432 | ❌ | ✅ | IPv6 networks only |
| **Session Pooler** | 5432 | ✅ | ✅ | **Recommended** - Persistent connections |
| **Transaction Pooler** | 6543 | ✅ | ✅ | Serverless/Lambda functions |

---

## Quick Test: Check IPv6 Support

```bash
# Test if your network supports IPv6
curl -6 https://ipv6.google.com

# If this fails, you MUST use the connection pooler
```

---

## Need Help?

Run the diagnostic script:

```bash
cd script/supabase
./test-connection.sh
```

It will tell you:
- ✅ What's working
- ❌ What's failing
- 💡 How to fix it
