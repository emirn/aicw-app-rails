-- Create ip_to_bot table for AI bot IP address detection
-- Simplified schema with just network range and bot name

-- Drop existing objects if they exist (for re-running migration)
DROP FUNCTION IF EXISTS get_bot_by_ip(text);
DROP TABLE IF EXISTS ip_to_bot;

-- Create table with composite primary key to allow same IP range for multiple bots
-- This handles cases where providers (e.g., OpenAI) share infrastructure across bot types
CREATE TABLE ip_to_bot (
  network inet NOT NULL,
  bot_name text NOT NULL,
  PRIMARY KEY (network, bot_name)
);

-- GiST index for fast IP range lookups using PostgreSQL inet operators
-- This allows efficient queries like: WHERE network >>= '1.2.3.4'::inet
CREATE INDEX idx_ip_to_bot_network ON ip_to_bot USING gist (network inet_ops);

-- Lookup function to get bot name from IP address
-- Returns first matching bot name (alphabetically ordered) if IP matches multiple bots
-- Returns NULL if IP is not in any known bot range
CREATE OR REPLACE FUNCTION get_bot_by_ip(ip_address text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT bot_name
  FROM ip_to_bot
  WHERE network >>= ip_address::inet
  ORDER BY bot_name
  LIMIT 1;
$$;

-- Comment the table and function
COMMENT ON TABLE ip_to_bot IS 'IP address ranges for AI bot detection. Updated via script/supabase/ip-to-bot/run.sh';
COMMENT ON FUNCTION get_bot_by_ip(text) IS 'Returns first matching bot name for given IP address (alphabetically ordered), or NULL if not a known bot IP';
