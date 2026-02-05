-- Set up pg_cron to automatically rotate daily_salt every 24 hours
-- This implements Plausible Analytics-style privacy: session hashes become irreversible after 24h

-- Enable pg_cron extension (requires superuser privileges)
-- Note: On Supabase, pg_cron is pre-enabled, but this is idempotent
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule existing job if it exists (idempotent migration)
SELECT cron.unschedule('rotate-daily-salt')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'rotate-daily-salt'
);

-- Schedule daily salt rotation at midnight UTC (00:00)
-- This job will:
-- 1. Generate a new unpredictable random salt using multiple entropy sources
-- 2. Update the daily_salt config value
-- 3. Automatically update the updated_at timestamp (via trigger)
--
-- Security: Uses multiple entropy sources to prevent prediction:
-- - random() x2: Independent random values (different each call)
-- - clock_timestamp(): Microsecond precision (never exactly 00:00:00.000000)
-- - txid_current(): Unique transaction ID (increments with each transaction)
SELECT cron.schedule(
  'rotate-daily-salt',                    -- Job name
  '0 0 * * *',                            -- Cron expression: Every day at 00:00 UTC
  $$
  UPDATE public.system_config
  SET config_value = md5(random()::text || random()::text || clock_timestamp()::text || txid_current()::text)
  WHERE config_key = 'daily_salt';
  $$
);

-- Log the cron job setup
DO $$
BEGIN
  RAISE NOTICE 'Daily salt rotation cron job scheduled successfully';
  RAISE NOTICE 'Job name: rotate-daily-salt';
  RAISE NOTICE 'Schedule: Daily at 00:00 UTC';
  RAISE NOTICE 'Privacy impact: Session hashes will rotate daily, preventing cross-day user tracking';
END $$;

-- Query to verify cron job was created:
-- SELECT * FROM cron.job WHERE jobname = 'rotate-daily-salt';

COMMENT ON EXTENSION pg_cron IS 'PostgreSQL job scheduler for periodic tasks. Used to rotate daily_salt every 24 hours for privacy.';
