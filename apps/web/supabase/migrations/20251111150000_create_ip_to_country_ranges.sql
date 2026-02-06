-- Create IP-to-Country lookup table for privacy-first geolocation
-- Uses PostgreSQL inet type with GiST indexing for fast range queries

-- Create the table
-- based on https://media.githubusercontent.com/media/iplocate/ip-address-databases/refs/heads/main/ip-to-country/ip-to-country.csv.zip?download=true
CREATE TABLE IF NOT EXISTS ip_to_country_ranges (
  id bigserial PRIMARY KEY,
  network inet NOT NULL,
  continent_code char(2) NOT NULL,
  country_code char(2) NOT NULL,
  country_name text NOT NULL
);

-- Create GiST index for fast IP range lookups
-- GiST (Generalized Search Tree) index supports inet operators like >>= (contains)
-- This enables sub-millisecond lookups even with 2M+ rows
CREATE INDEX idx_ip_range_gist ON ip_to_country_ranges USING gist (network inet_ops);

-- Add comment for documentation
-- IP to country is https://media.githubusercontent.com/media/iplocate/ip-address-databases/refs/heads/main/ip-to-country/ip-to-country.csv.zip?download=true
COMMENT ON TABLE ip_to_country_ranges IS 'IP geolocation database for privacy-first country detection. IPs are anonymized (last octet stripped) before lookup.';
COMMENT ON COLUMN ip_to_country_ranges.network IS 'CIDR notation (e.g., 1.0.0.0/24)';
COMMENT ON COLUMN ip_to_country_ranges.continent_code IS 'ISO 3166-1 alpha-2 continent code';
COMMENT ON COLUMN ip_to_country_ranges.country_code IS 'ISO 3166-1 alpha-2 country code';
COMMENT ON COLUMN ip_to_country_ranges.country_name IS 'Country name';

-- Grant access to service role (for data loading script)
GRANT ALL ON ip_to_country_ranges TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ip_to_country_ranges_id_seq TO service_role;

-- Grant read access to authenticated users (for analytics functions)
GRANT SELECT ON ip_to_country_ranges TO authenticated;
