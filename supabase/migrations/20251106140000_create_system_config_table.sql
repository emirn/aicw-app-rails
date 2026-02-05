-- Create system_config table for storing daily rotating salt and other system-wide configs
-- This enables Plausible Analytics-style anonymous session tracking

CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(50) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Add index for fast lookups by config_key
CREATE INDEX IF NOT EXISTS idx_system_config_key ON public.system_config(config_key);

-- Add comments
COMMENT ON TABLE public.system_config IS 'System-wide configuration values including daily rotating salt for session hashing';
COMMENT ON COLUMN public.system_config.config_key IS 'Unique configuration key (e.g., daily_salt)';
COMMENT ON COLUMN public.system_config.config_value IS 'Configuration value (can be any text/json)';
COMMENT ON COLUMN public.system_config.updated_at IS 'Last update timestamp (important for daily_salt rotation tracking)';

-- Insert initial daily salt (32 hex characters)
-- Uses multiple entropy sources for unpredictable randomness:
-- - random() x2: Two independent random values
-- - clock_timestamp(): Microsecond-precision timestamp
-- - txid_current(): Unique transaction ID
-- This will be rotated daily by pg_cron
INSERT INTO public.system_config (config_key, config_value)
VALUES ('daily_salt', md5(random()::text || random()::text || clock_timestamp()::text || txid_current()::text))
ON CONFLICT (config_key) DO NOTHING;

-- Add trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_config_timestamp
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_system_config_updated_at();
