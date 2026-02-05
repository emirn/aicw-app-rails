/**
 * Device type constants
 * Stored as LowCardinality(String) in database
 * Empty string = unknown/undetected
 *
 * Detectable types from ua-parser-js v2:
 * - mobile: Smartphones
 * - tablet: Tablets
 * - console: Gaming consoles (PlayStation, Xbox, Nintendo)
 * - smarttv: Smart TVs and streaming devices
 * - wearable: Smartwatches
 * - desktop: Default fallback (not detected by UA parser)
 */

export const UNKNOWN_VALUE = 'unknown'; // fallback value for unknown/undetected values

export const DEVICE_TYPE = {
  UNKNOWN: UNKNOWN_VALUE,
  DESKTOP: 'desktop',
  MOBILE: 'mobile',
  TABLET: 'tablet',
  CONSOLE: 'console',
  SMARTTV: 'smarttv',
  WEARABLE: 'wearable',
} as const;

export type DeviceType = typeof DEVICE_TYPE[keyof typeof DEVICE_TYPE];

/**
 * Cache TTL constants for analytics endpoints
 * Used for both PostgreSQL cache table TTL and HTTP Cache-Control headers
 */
export const CACHE_TTL = {
  // Public analytics pages: 24 hours (visitors don't need real-time data)
  PUBLIC_MINUTES: 24 * 60, // 1440 minutes
  PUBLIC_SECONDS: 24 * 60 * 60, // 86400 seconds (for Cache-Control header)

  // Authenticated analytics: 15 minutes (site owners want fresher data)
  AUTHENTICATED_MINUTES: 15,
  AUTHENTICATED_SECONDS: 15 * 60, // 900 seconds (for Cache-Control header)
} as const;
