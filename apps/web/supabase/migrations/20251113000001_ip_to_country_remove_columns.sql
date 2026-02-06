-- Drop some columns

-- Add new columns for enhanced geolocation
ALTER TABLE ip_to_country_ranges
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;

-- Drop existing function first (signature changed)
DROP FUNCTION IF EXISTS find_country_by_ip(text);

-- Update RPC function to return new fields
CREATE OR REPLACE FUNCTION find_country_by_ip(ip_address text)
RETURNS TABLE(
  country_code char(2),
  country_name text,
  region_code varchar(10),
  region_name text,
  city_name text
) AS $$
  SELECT
    country_code,
    country_name,
    region_code,
    region_name,
    city_name
  FROM ip_to_country_ranges
  WHERE network >>= ip_address::inet
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Add comments for documentation
COMMENT ON COLUMN ip_to_country_ranges.region_code IS 'State/Province code (varies by country)';
COMMENT ON COLUMN ip_to_country_ranges.region_name IS 'State/Province/Region name (e.g., California, Ontario)';
COMMENT ON COLUMN ip_to_country_ranges.city_name IS 'City name (e.g., San Francisco, Toronto)';

-- Update table comment to reflect new data source
COMMENT ON TABLE ip_to_country_ranges IS 'IP geolocation database with city and state/region data. Data from DB-IP City Lite (db-ip.com). IPs are anonymized (last 2 parts removed) before lookup. License: CC BY 4.0 (attribution required).';
