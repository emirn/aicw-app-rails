/**
 * Country code mapping utilities using Intl.DisplayNames
 * Maps ISO 3166-1 alpha-2 country codes to full country names
 * Uses the browser's built-in Intl API for localized country names
 */

// Create a region display names instance (English)
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/**
 * Get full country name from ISO 3166-1 alpha-2 country code
 * Uses the browser's Intl.DisplayNames API for localized names
 */
export function getCountryName(code: string | null | undefined): string {
  if (!code) return "Unknown";

  const upperCode = code.toUpperCase();

  // "ZZ" is the reserved "Unknown" country code used by Tinybird
  if (upperCode === "ZZ") return "Unknown";

  try {
    const name = regionNames.of(upperCode);
    if (!name || name === upperCode) return "Unknown";
    return name;
  } catch {
    return "Unknown";
  }
}

/**
 * Check if a string is a valid ISO 3166-1 alpha-2 country code
 */
export function isValidCountryCode(code: string): boolean {
  try {
    const name = regionNames.of(code.toUpperCase());
    return name !== undefined && name !== code.toUpperCase();
  } catch {
    return false;
  }
}
