-- Create PostgreSQL function for IP-to-country lookup
-- This function properly handles INET type casting and uses the >>= operator
-- for network containment checks (checking if an IP is within a CIDR range)

CREATE OR REPLACE FUNCTION find_country_by_ip(ip_address text)
RETURNS TABLE(country_code char(2), country_name text) AS $$
  SELECT country_code, country_name
  FROM ip_to_country_ranges
  WHERE network >>= ip_address::inet
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Add comment for documentation
COMMENT ON FUNCTION find_country_by_ip(text) IS
  'Finds country information for a given IP address by checking which CIDR range contains it. Uses the >>= operator for efficient INET containment checks with GiST index.';
