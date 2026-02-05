#!/bin/bash

# Quick DNS and Connection Test
echo "🔍 Diagnosing connection issue..."
echo ""

# Load the .env.local file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.local"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "❌ .env.local not found"
  exit 1
fi

# Support both connection string and individual components
if [[ -z "$SUPABASE_DB_URL" ]] || [[ "$SUPABASE_DB_URL" == *"YOUR_PASSWORD_HERE"* ]]; then
    if [[ -n "$SUPABASE_DATABASE_HOST" ]] && [[ -n "$SUPABASE_DATABASE_USER" ]] && [[ -n "$SUPABASE_DATABASE_PASSWORD" ]]; then
        SUPABASE_DATABASE_PORT=${SUPABASE_DATABASE_PORT:-5432}
        SUPABASE_DATABASE_NAME=${SUPABASE_DATABASE_NAME:-postgres}
        SUPABASE_DB_URL="postgresql://${SUPABASE_DATABASE_USER}:${SUPABASE_DATABASE_PASSWORD}@${SUPABASE_DATABASE_HOST}:${SUPABASE_DATABASE_PORT}/${SUPABASE_DATABASE_NAME}"
        echo "✓ Using individual components to construct URL"
        echo ""
    else
        echo "❌ No valid database configuration found"
        exit 1
    fi
fi

# Extract hostname from connection string
HOSTNAME=$(echo "$SUPABASE_DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')

echo "📍 Testing hostname: $HOSTNAME"
echo ""

# Test 1: DNS resolution
echo "1️⃣ DNS Resolution Test:"
if host "$HOSTNAME" &> /dev/null; then
  echo "   ✅ DNS resolution successful"
  host "$HOSTNAME" | head -3
else
  echo "   ❌ DNS resolution failed"
  echo "   This is your issue! Possible causes:"
  echo "   - No internet connection"
  echo "   - DNS server issues"
  echo "   - VPN/firewall blocking DNS"
  echo "   - Incorrect hostname in connection string"
fi
echo ""

# Test 2: Ping test
echo "2️⃣ Network Connectivity Test:"
if ping -c 2 "$HOSTNAME" &> /dev/null; then
  echo "   ✅ Can reach host"
else
  echo "   ❌ Cannot ping host"
fi
echo ""

# Test 3: Port connectivity
echo "3️⃣ PostgreSQL Port Test (5432):"
if nc -z -w 5 "$HOSTNAME" 5432 2> /dev/null; then
  echo "   ✅ Port 5432 is reachable"
else
  echo "   ❌ Port 5432 is not reachable"
fi
echo ""

# Test 4: Full connection string check
echo "4️⃣ Connection String Format:"
if [[ "$SUPABASE_DB_URL" =~ ^postgresql://[^:]+:[^@]+@[^:]+:[0-9]+/.+ ]]; then
  echo "   ✅ Format looks correct"
  echo "   Masked: $(echo "$SUPABASE_DB_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/****:****@/')"
else
  echo "   ⚠️  Format may be incorrect"
  echo "   Expected: postgresql://user:password@host:port/database"
fi
echo ""

# Test 5: Internet connectivity
echo "5️⃣ General Internet Test:"
if ping -c 2 8.8.8.8 &> /dev/null; then
  echo "   ✅ Internet connection working"
else
  echo "   ❌ No internet connection"
fi
echo ""

# Test 6: DNS server check
echo "6️⃣ DNS Server Check:"
if [[ -f /etc/resolv.conf ]]; then
  echo "   Your DNS servers:"
  grep "^nameserver" /etc/resolv.conf | head -3
else
  echo "   Using system DNS (macOS)"
  scutil --dns | grep 'nameserver\[0\]' | head -3
fi

