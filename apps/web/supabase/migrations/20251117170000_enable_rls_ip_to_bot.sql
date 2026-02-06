-- Enable Row Level Security on ip_to_bot table
-- This table contains bot IP ranges and should only be accessible by Edge Functions (service role)
-- Regular authenticated/anonymous users should never access this table directly

-- Revoke default privileges
REVOKE ALL ON ip_to_bot FROM authenticated;
REVOKE ALL ON ip_to_bot FROM anon;

-- Enable RLS
ALTER TABLE public.ip_to_bot ENABLE ROW LEVEL SECURITY;

-- Service role only can read (deny-all policy for non-service roles)
CREATE POLICY "Service role only can read ip_to_bot"
  ON ip_to_bot
  FOR SELECT
  USING (false);

-- Deny all inserts (only import script via service role can insert)
CREATE POLICY "No one can insert ip_to_bot"
  ON ip_to_bot
  FOR INSERT
  WITH CHECK (false);

-- Deny all updates
CREATE POLICY "No one can update ip_to_bot"
  ON ip_to_bot
  FOR UPDATE
  USING (false);

-- Deny all deletes (only TRUNCATE via service role during imports)
CREATE POLICY "No one can delete ip_to_bot"
  ON ip_to_bot
  FOR DELETE
  USING (false);

-- Comment
COMMENT ON TABLE ip_to_bot IS 'IP address ranges for AI bot detection. Protected by RLS - service role only. Updated via script/supabase/ip-to-bot/run.sh';
