/**
 * IP-to-Country lookup using MMDB (MaxMind DB format)
 *
 * Uses dbip-country-lite MMDB file for in-memory IP geolocation.
 * No database dependency — the MMDB file is bundled with the edge function.
 *
 * Source: https://db-ip.com/db/download/ip-to-country-lite
 * License: Creative Commons Attribution 4.0 International License
 */

import { Reader } from "https://esm.sh/mmdb-lib@2.1.1";
import { Buffer } from "https://esm.sh/buffer@6.0.3";

export interface GeoLocation {
  country_code: string | null;
  country_name: string | null;   // Deprecated: frontend resolves names via Intl.DisplayNames
  region_name: string | null;
  city_name: string | null;
}

// Module-level cache for the MMDB Reader (survives across warm invocations)
let mmdbReader: Reader<{ country: { iso_code: string } }> | null = null;

/**
 * Load and cache the MMDB reader instance.
 * The MMDB file is included via static_files in config.toml and available
 * relative to the function's working directory at runtime.
 */
async function getReader(): Promise<Reader<{ country: { iso_code: string } }>> {
  if (mmdbReader) return mmdbReader;

  const rawBuffer = await Deno.readFile("./data/dbip-country-lite.mmdb");
  const buffer = Buffer.from(rawBuffer);
  mmdbReader = new Reader<{ country: { iso_code: string } }>(buffer);
  console.log('[IP-to-Country] MMDB reader loaded successfully');
  return mmdbReader;
}

/**
 * Get geo-location by IP address using MMDB lookup
 *
 * @param ipAddress - IPv4 or IPv6 address (can be anonymized)
 * @returns GeoLocation with country_code or null
 */
export async function getGeoLocationByIP(
  ipAddress: string | null | undefined,
): Promise<GeoLocation | null> {

  if (!ipAddress) {
    console.error('[IP-to-Country] No IP address provided');
    return null;
  }

  // Validate IP format (IPv4 or IPv6)
  const isIPv4 = ipAddress.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  const isIPv6 = ipAddress.includes(':');

  if (!isIPv4 && !isIPv6) {
    console.error('[IP-to-Country] Invalid IP format [redacted for privacy]');
    return null;
  }

  try {
    const reader = await getReader();
    const result = reader.get(ipAddress);

    if (!result || !result.country || !result.country.iso_code) {
      console.debug('[IP-to-Country] No results for IP');
      return null;
    }

    return {
      country_code: result.country.iso_code,
      country_name: '',    // Deprecated: frontend resolves names via Intl.DisplayNames
      region_name: null,   // Country-level DB only
      city_name: null,     // Country-level DB only
    };
  } catch (error) {
    console.error('[IP-to-Country] MMDB lookup error:', error);
    return null;
  }
}
