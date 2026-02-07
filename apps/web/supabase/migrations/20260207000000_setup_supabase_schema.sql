-- ============================================================================
-- Consolidated Supabase Schema
-- ============================================================================
-- This is the complete schema for the Supabase database.
-- Only 2 tables are needed — everything else lives in Rails (SQLite).
--
-- Tables:
--   1. system_config  — Daily rotating salt for privacy-first session hashing
--   2. projects_new   — Minimal project lookup for edge function validation
--
-- The "view" edge function (supabase/functions/view/) is the only consumer.
-- It validates tracking requests and forwards events to Tinybird.
-- ============================================================================

-- ============================================================================
-- 1. system_config — System-wide configuration
-- ============================================================================
-- Stores the daily rotating salt used by the "view" edge function to generate
-- Plausible Analytics-style anonymous session hashes.
-- Salt rotates daily via pg_cron to prevent cross-day user tracking.

CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(50) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_config_key ON public.system_config(config_key);

COMMENT ON TABLE public.system_config IS 'System-wide configuration values including daily rotating salt for session hashing';
COMMENT ON COLUMN public.system_config.config_key IS 'Unique configuration key (e.g., daily_salt)';
COMMENT ON COLUMN public.system_config.config_value IS 'Configuration value';
COMMENT ON COLUMN public.system_config.updated_at IS 'Last update timestamp (important for daily_salt rotation tracking)';

-- Trigger: auto-update updated_at on changes
CREATE OR REPLACE FUNCTION public.update_system_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_config_timestamp
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_system_config_updated_at();

-- Seed: initial daily salt (32 hex characters, multiple entropy sources)
INSERT INTO public.system_config (config_key, config_value)
VALUES ('daily_salt', md5(random()::text || random()::text || clock_timestamp()::text || txid_current()::text))
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- 2. Daily salt rotation cron job
-- ============================================================================
-- Rotates the daily_salt at midnight UTC every day.
-- Session hashes become irreversible after 24 hours (privacy by design).

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('rotate-daily-salt')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'rotate-daily-salt'
);

SELECT cron.schedule(
  'rotate-daily-salt',
  '0 0 * * *',
  $$
  UPDATE public.system_config
  SET config_value = md5(random()::text || random()::text || clock_timestamp()::text || txid_current()::text)
  WHERE config_key = 'daily_salt';
  $$
);

-- ============================================================================
-- 3. projects_new — Minimal project lookup for edge function
-- ============================================================================
-- Synced from Rails via SupabaseProjectSync (background job).
-- Rails is the source of truth for all project/user/subscription data.
-- This table exists solely for the "view" edge function to validate
-- tracking requests (check tracking_id exists, domain matches, is_active).

CREATE TABLE IF NOT EXISTS public.projects_new (
  tracking_id UUID PRIMARY KEY,
  domain TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  rails_project_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_new_domain ON public.projects_new(domain);
CREATE INDEX IF NOT EXISTS idx_projects_new_is_active ON public.projects_new(is_active);

COMMENT ON TABLE public.projects_new IS 'Minimal projects table for edge function validation. Synced from Rails.';
COMMENT ON COLUMN public.projects_new.tracking_id IS 'UUID used in tracking script (data_key parameter)';
COMMENT ON COLUMN public.projects_new.domain IS 'Allowed domain for this project';
COMMENT ON COLUMN public.projects_new.is_active IS 'Whether analytics tracking is enabled (based on subscription status in Rails)';
COMMENT ON COLUMN public.projects_new.rails_project_id IS 'Reference to Rails project ID for debugging';

-- Trigger: auto-update updated_at on changes
CREATE OR REPLACE FUNCTION public.update_projects_new_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_new_updated_at
  BEFORE UPDATE ON public.projects_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_projects_new_updated_at();
