-- Enable RLS on ip_to_country_ranges table
-- This table contains IP-to-country mapping reference data used by Edge Functions
-- for geolocation lookups (with IP anonymization).

BEGIN;

-- Remove overly broad grant that allows any authenticated user to query the table
-- This prevents exposure via PostgREST API
REVOKE SELECT ON ip_to_country_ranges FROM authenticated;

-- Enable Row Level Security
ALTER TABLE public.ip_to_country_ranges ENABLE ROW LEVEL SECURITY;

-- Policy 1: Deny SELECT to regular users
-- Service role (Edge Functions) bypasses RLS automatically
CREATE POLICY "Service role only can read ip_to_country_ranges"
  ON public.ip_to_country_ranges
  FOR SELECT
  USING (false);

-- Policy 2: Deny INSERT to all users
-- Data loading should be done via service role which bypasses RLS
CREATE POLICY "No one can insert ip_to_country_ranges"
  ON public.ip_to_country_ranges
  FOR INSERT
  WITH CHECK (false);

-- Policy 3: Deny UPDATE to all users
-- Reference data should be immutable after loading
CREATE POLICY "No one can update ip_to_country_ranges"
  ON public.ip_to_country_ranges
  FOR UPDATE
  USING (false);

-- Policy 4: Deny DELETE to all users
-- Reference data should be immutable after loading
CREATE POLICY "No one can delete ip_to_country_ranges"
  ON public.ip_to_country_ranges
  FOR DELETE
  USING (false);

-- Document the security model
COMMENT ON TABLE public.ip_to_country_ranges IS
  'IP geolocation reference data (RLS enabled).
   READ: Service role only (Edge Functions use this for IP-to-country lookups)
   WRITE: Service role only (data loading from iplocate GitHub database)
   DENIED: All regular users (authenticated or anonymous)

   Security: RLS enabled with deny-all policies. Service role bypasses RLS automatically.
   Performance: GiST index (idx_ip_range_gist) enables sub-millisecond lookups.
   Privacy: IPs are anonymized (last 2 octets removed) before lookup.';

COMMIT;
