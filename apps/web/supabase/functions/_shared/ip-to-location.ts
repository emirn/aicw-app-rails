/*

Source Database DB IP Lite:
https://db-ip.com/db/download/ip-to-city-lite

Imported using /script/supabase/ip-to-location/convert-and-import-ip-data.sh

SAMPLE:

SELECT * FROM find_country_by_ip('172.96.140.01');

Should return US, Los Angeles

// download and import CSV from this url below to public.ip_to_country_ranges table
// IP to country database: https://media.githubusercontent.com/media/iplocate/ip-address-databases/refs/heads/main/ip-to-country/ip-to-country.csv.zip?download=true
// fields in this database:
// network,continent_code,country_code,country_name
*/

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";


/**
 * Get geo-location by IP address (privacy-first approach)
 *
 * Process:
 * 1. Validate IP format and check if private
 * 2. IP MUST be pre-anonymized by caller (remove last 2 parts: IPv4 octets or IPv6 groups)
 * 3. Query PostgreSQL with GIST index using anonymized IP
 * 4. Return country/region data
 *
 * Privacy Note: This function expects PRE-ANONYMIZED IP addresses.
 * Caller must anonymize IP (Matomo-style: remove last 2 octets/groups)
 * before calling this function. The anonymized IP exists only in memory
 * during request processing and is never stored.
 *
 * Accuracy Trade-off: Anonymization may result in less accurate geolocation.
 * Some IP addresses may resolve to incorrect country/region due to IP range
 * overlap after masking. We accept this trade-off for privacy.
 *
 * @param ip - Pre-anonymized IPv4 or IPv6 address (e.g., "192.168.0.0" or "2001:db8::1234:0")
 * @param supabaseClient - Supabase client for database queries
 * @returns GeoLocation with country/region or null
 */
export interface GeoLocation {
  country_code: string | null;   // ISO 3166-1 alpha-2 country code (e.g., "AE")
  country_name: string | null;   // Deprecated: frontend resolves names via Intl.DisplayNames
  region_name: string | null;    // Region/state name (e.g., "California")
  city_name: string | null;    // City name (e.g., "San Francisco")
}

export async function getGeoLocationByIP(
  ipAddress: string | null | undefined,
  supabaseClient: SupabaseClient
): Promise<GeoLocation | null> {

  if (!ipAddress) {
    console.error('[IP-to-Country] No IP address provided');
    return null;
  }

  // Validate anonymized IP format (IPv4 or IPv6)
  const isIPv4 = ipAddress.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  const isIPv6 = ipAddress.includes(':');

  if (!isIPv4 && !isIPv6) {
    console.error('[IP-to-Country] Invalid anonymized IP format [redacted for privacy]');
    return null;
  }

  try {
    // Query PostgreSQL using RPC function with anonymized IP
    // The find_country_by_ip function uses >>= operator for network containment
    // This finds the IP range that contains our anonymized IP address

    const { data, error } = await supabaseClient
      .rpc('find_country_by_ip', { ip_address: ipAddress });

    if (error) {
      console.error('[IP-to-Country] Database query error:', error.message);
      return null;
    }

    // Validate data structure
    if (!Array.isArray(data) || data.length === 0) {
      console.debug('[IP-to-Country] No results for anonymized IP');
      return null;
    }

    const result = data[0];

    // Validate result is an object with required fields
    if (!result || typeof result !== 'object') {
      console.error('[IP-to-Country] Invalid result structure:', typeof result);
      return null;
    }

    // Type guard: Check country_code exists
    if (!result.country_code) {
      console.error('[IP-to-Country] Missing country_code in result');
      return null;
    }

    // Return validated GeoLocation object
    // Note: country_name is deprecated - frontend resolves names via Intl.DisplayNames
    return {
      country_code: result.country_code,
      country_name: '',  // Deprecated: frontend resolves names via Intl.DisplayNames
      region_name: result.region_name || null,
      city_name: result.city_name || null
    } as GeoLocation;
  } catch (error) {
    console.error('[IP-to-Country] Lookup error:', error);
    return null;
  }
}
