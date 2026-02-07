/**
 * Geo-location detection module
 *
 * Detects country and state from:
 * 1. Cloudflare headers (primary method) - provides country + state
 * 2. IP-to-country lookup (fallback) - provides country only
 *
 * Based on ISO 3166-1 country codes
 */

// Import data from separate JSON files for better maintainability
import { GeoLocation, getGeoLocationByIP } from "./ip-to-location.ts";

export const UNKNOWN_GEO_LOCATION: GeoLocation = {
  country_code: 'ZZ',
  country_name: '',  // Deprecated: frontend resolves names via Intl.DisplayNames
  region_name: null,
  city_name: null
};

/**
 * Detect geo-location from Cloudflare headers
 * Headers available when traffic passes through Cloudflare proxy
 */
async function detectFromCloudflare(headers: Headers): Promise<GeoLocation | null> {

  // Verify request actually came through Cloudflare (prevent header spoofing)
  const cfRay = headers.get("CF-Ray");
  if (!cfRay) {
    // Not a Cloudflare request, don't trust CF headers
    return null;
  }

  // CF-IPCountry: ISO 3166-1 alpha-2 country code
  const cfCountryCode = headers.get("CF-IPCountry")?.toUpperCase();
  if (cfCountryCode && cfCountryCode !== "XX") {
    // CF-Region-Code or CF-Region: State/region code (e.g., "CA" for California)
    // Available for US, Canada, and some other countries with subdivisions
    const cfRegionCode = headers.get("CF-Region-Code") || headers.get("CF-Region");
    const cfCityName = headers.get("CF-City") || headers.get("CF-City-Name");

    return {
      country_code: cfCountryCode,
      country_name: '',  // Deprecated: frontend resolves names via Intl.DisplayNames
      region_name: cfRegionCode || null, // Cloudflare provides code; name can be resolved client-side if needed,
      city_name: cfCityName || null
    } as GeoLocation;
  }

  return null;
}

export async function detectGeoLocation(
  ipAddress: string | null,  // Pre-anonymized IP address (last 2 parts removed)
  headers: Headers,
): Promise<GeoLocation | null> {
  // Try Cloudflare headers first (most accurate, provides country + state)
  const cloudflareData = await detectFromCloudflare(headers);

  // If Cloudflare provided valid country data, use it
  // Region and city are optional - many countries/IPs don't have this granularity
  if (cloudflareData &&
    cloudflareData.country_code &&
    cloudflareData.country_code !== UNKNOWN_GEO_LOCATION.country_code
  ) {
    return cloudflareData;
  }

  // Fallback to IP-to-country lookup (only provides country, not state)
  // NOTE: ipAddress MUST be pre-anonymized by caller
  if (ipAddress) {
    const geoLocation: GeoLocation | null = await getGeoLocationByIP(ipAddress);
    return geoLocation;
  }

  // return empty geo location
  return UNKNOWN_GEO_LOCATION;
}
