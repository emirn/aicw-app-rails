import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UAParser } from "npm:ua-parser-js@2";
// -- user libraries
import { UtmParams, VisitorSourceType } from "../_shared/constants-visitor-sources.ts";
import { detectBotFromUA } from "../_shared/bot-detection.ts";
import { VisitorSourceDetectionResult, findVisitorSource } from "../_shared/visitor-source-detection.ts";
import { detectGeoLocation } from "../_shared/geo-detection.ts";
import { DEVICE_TYPE, type DeviceType } from "../_shared/constants.ts";
import { extractRequestDomain, isAllowedDomain } from "../_shared/domain-validation.ts";
import { anonymizeIP } from "../_shared/ip-anonymization.ts";
import { UNKNOWN_VALUE } from "../_shared/constants.ts";

const REQUEST_RETRY_MS = 1000; // delay between retries for http requests in mseconds

const FUNCTION_VERSION = '2026-feb-05-simplified-projects-table'; 
const MAX_STRING_LENGTH = 2000;
const MAX_UTM_LENGTH = 255;

const MAX_PAYLOAD_BODY_SIZE = 100 * 1024; // 100KB max payload body size to prevent memory issues
const MAX_LOG_PAYLOAD_LENGTH = 1000; // max payload length to log in error logs
const MAX_LOG_USER_AGENT_LENGTH = 200; // max user agent length to log in error logs

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// Check for common bot pattern

const MIN_SALT_LENGTH = 32; // Cryptographically secure minimum for daily salt

// Tracking ID validation constants (simplified)
const TID_VALIDATION = {
  LENGTH: 36,                           // Total character count
  HYPHEN_POSITIONS: [8, 13, 18, 23],   // Where hyphens must be
  HYPHEN_CODE: 45,                      // ASCII code for '-'
  // ASCII code ranges for valid hex characters: [min, max]
  CHAR_RANGES: [
    [48, 57],   // '0'-'9'
    [65, 70],   // 'A'-'F'
    [97, 102]   // 'a'-'f'
  ]
} as const;

// ============================================================================
// Security Error Codes (for malformed request logging and filtering)
// ============================================================================
const SECURITY_ERROR = {
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  MALFORMED_JSON: 'MALFORMED_JSON',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  MISSING_TRACKING_ID: 'MISSING_TRACKING_ID',
  INVALID_TRACKING_ID: 'INVALID_TRACKING_ID',
} as const;

type SecurityErrorCode = typeof SECURITY_ERROR[keyof typeof SECURITY_ERROR];

/**
 * Log security event with full forensic data for malformed requests
 * Includes raw IP address for security analysis (GDPR: legitimate interest for security)
 *
 * Security: details is spread FIRST so critical fields cannot be overwritten by malicious input
 * Structured: Single JSON object for easier log parsing and aggregation
 *
 * @param requestId - Request ID for tracing
 * @param errorCode - Security error code for log filtering
 * @param rawIP - Full (non-anonymized) IP address
 * @param req - Original request object for headers
 * @param details - Additional context-specific details (spread first, cannot override critical fields)
 */
function logSecurityEvent(
  requestId: string,
  errorCode: SecurityErrorCode,
  rawIP: string,
  req: Request,
  details: Record<string, unknown>
): void {
  // Structured logging: single JSON object for easier parsing
  // Security: spread details first so critical fields always take precedence
  console.error(JSON.stringify({
    ...details,
    request_id: requestId,
    error_code: errorCode,
    ip_address: rawIP,
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    user_agent: req.headers.get('user-agent')?.slice(0, MAX_LOG_USER_AGENT_LENGTH),
    content_type: req.headers.get('content-type'),
    timestamp: new Date().toISOString()
  }));
}

/**
 * Create error response for malformed requests (400 Bad Request)
 * Returns plain text with error code prefix for easy debugging
 */
function createValidationErrorResponse(
  errorCode: SecurityErrorCode,
  message: string,
  headers: Record<string, string>
): Response {
  return new Response(
    `${errorCode}: ${message}`,
    { status: 400, headers: { ...headers, 'Content-Type': 'text/plain' } }
  );
}


/**
 * Validate tracking ID format (simplified)
 * Checks: length, valid characters (using ASCII ranges), hyphen positions
 * Fails immediately at first invalid character
 * @param tid - Tracking ID to validate
 * @returns true if valid UUID format
 */
function isValidTrackingId(tid: string): boolean {
  // 1. Check length
  if (!tid || tid.length !== TID_VALIDATION.LENGTH) {
    return false;
  }

  // 2. Check each character using ASCII code ranges (fails at first issue)
  for (let i = 0; i < tid.length; i++) {
    const code = tid.charCodeAt(i);

    // Check if this position should have a hyphen
    if (TID_VALIDATION.HYPHEN_POSITIONS.includes(i as 8 | 13 | 18 | 23)) {
      // Must be a hyphen (ASCII 45)
      if (code !== TID_VALIDATION.HYPHEN_CODE) return false;
    } else {
      // Must be a valid hex character - check if code falls in any range
      let isValid = false;
      for (const range of TID_VALIDATION.CHAR_RANGES) {
        if (code >= range[0] && code <= range[1]) {
          isValid = true;
          break;
        }
      }
      if (!isValid) return false;
    }
  }

  return true;
}

// ============================================================================
// Privacy-First Session Tracking (Plausible Analytics-style)
// ============================================================================

/**
 * Global cache for daily salt to avoid repeated database queries
 * Salt is cached for 1 hour, then reloaded (in case cron job has rotated it)
 */
let DAILY_SALT_CACHE: { value: string; loadedAt: number } | null = null;

/**
 * Validate daily salt for cryptographic security
 * Ensures salt is not empty, null, or too short (minimum 32 characters)
 *
 * @param salt - Daily salt value to validate
 * @param requestId - Request ID for tracing/logging
 * @throws Error if salt is invalid
 */
function validateDailySalt(salt: string | null | undefined, requestId?: string): void {
  const logPrefix = requestId ? `[${requestId}] ` : '';

  // Check for null/undefined
  if (!salt || typeof salt !== 'string') {
    console.error(`${logPrefix}[CRITICAL] Daily salt is null/undefined`);
    throw new Error('Daily salt validation failed: salt is null or undefined');
  }

  // Check for empty string
  if (salt.trim().length === 0) {
    console.error(`${logPrefix}[CRITICAL] Daily salt is empty string`);
    throw new Error('Daily salt validation failed: salt is empty');
  }

  // Check minimum length (cryptographically secure minimum)
  if (salt.length < MIN_SALT_LENGTH) {
    console.error(`${logPrefix}[CRITICAL] Daily salt too short: ${salt.length} chars (minimum: ${MIN_SALT_LENGTH})`);
    throw new Error(`Daily salt validation failed: insufficient length (${salt.length}/${MIN_SALT_LENGTH} chars)`);
  }

  // Optional: Check for obviously weak salts (all same character)
  if (/^(.)\1+$/.test(salt)) {
    console.error(`${logPrefix}[CRITICAL] Daily salt has insufficient randomness (repeating character)`);
    throw new Error('Daily salt validation failed: insufficient randomness');
  }
}

/**
 * Load daily salt from database with caching
 * Salt rotates every 24 hours via pg_cron for privacy
 */
async function getDailySalt(supabaseClient: any, requestId?: string): Promise<string> {
  const logPrefix = requestId ? `[${requestId}] ` : '';
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  // Use cache if available and less than 1 hour old
  if (DAILY_SALT_CACHE && (now - DAILY_SALT_CACHE.loadedAt) < ONE_HOUR) {
    // Validate cached salt (defense in depth)
    validateDailySalt(DAILY_SALT_CACHE.value, requestId);
    console.log(`${logPrefix} Daily salt loaded from cache (less than 1 hour old)`);
    return DAILY_SALT_CACHE.value;
  }

  // Load fresh salt from database with timeout
  const { data, error } = await withTimeout(
    supabaseClient
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'daily_salt')
      .single(),
    5000,
    'Daily salt query',
    requestId || 'unknown'
  );

  if (error || !data) {
    console.error(`${logPrefix}Failed to load daily salt:`, error);
    throw new Error('Failed to load daily salt from system_config');
  }

  // Validate salt BEFORE caching (critical security check)
  validateDailySalt(data.config_value, requestId);

  // Update cache
  DAILY_SALT_CACHE = { value: data.config_value, loadedAt: now };
  console.log(`${logPrefix}Daily salt loaded from database (cached for 1 hour)`);

  return data.config_value;
}

/**
 * Generate privacy-preserving session hash (Plausible Analytics-style)
 * Combines daily salt + IP + user agent + website host and hashes with SHA-256
 * Session changes daily when salt rotates, preventing long-term tracking
 *
 * @param dailySalt - Daily rotating salt from database
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent string
 * @param websiteHost - Website hostname
 * @returns SHA-256 hash as hex string
 */
async function generateSessionHash(
  dailySalt: string,
  ipAddress: string,
  userAgent: string,
  websiteHost: string
): Promise<string> {
  // Combine all inputs into single string
  const data = `${dailySalt}${ipAddress}${userAgent}${websiteHost}`;

  // Hash using SHA-256 (Web Crypto API)
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Parse user agent string into structured data
 * Extracts: browser name, OS name, device type
 *
 * This allows storing categorical data instead of raw user agent strings (privacy-first)
 * Note: Browser/OS versions NOT stored for better privacy compliance
 *
 * @param uaString - User agent string to parse
 * @param requestId - Optional request ID for log tracing
 */
function parseUserAgent(uaString: string | null | undefined, requestId?: string) {
  if (!uaString) {
    return {
      browser_name: UNKNOWN_VALUE,
      os_name: UNKNOWN_VALUE,
      device_type: DEVICE_TYPE.UNKNOWN,
    };
  }

  try {
    const parser = new UAParser(uaString);
    const result = parser.getResult();

    // Detect device type from UA parser
    // ua-parser-js v2 can detect: mobile, tablet, console, smarttv, wearable, embedded, xr
    let deviceType: DeviceType = DEVICE_TYPE.UNKNOWN;

    switch (result.device.type) {
      case 'mobile':
        deviceType = DEVICE_TYPE.MOBILE;
        break;
      case 'tablet':
        deviceType = DEVICE_TYPE.TABLET;
        break;
      case 'console':
        deviceType = DEVICE_TYPE.CONSOLE;
        break;
      case 'smarttv':
        deviceType = DEVICE_TYPE.SMARTTV;
        break;
      case 'wearable':
        deviceType = DEVICE_TYPE.WEARABLE;
        break;
      // Note: 'embedded' and 'xr' not mapped (low analytics value)
      default:
        // Desktop browsers don't set device.type (undefined) - treat as desktop
        deviceType = DEVICE_TYPE.DESKTOP;
        break;
    }

    return {
      browser_name: result.browser.name || UNKNOWN_VALUE,
      os_name: result.os.name || UNKNOWN_VALUE,
      device_type: deviceType
    };
  } catch (e) {
    const logPrefix = requestId ? `[${requestId}] ` : '';
    console.error(`${logPrefix}User agent parsing error:`, e);
    return {
      browser_name: UNKNOWN_VALUE,
      os_name: UNKNOWN_VALUE,
      device_type: DEVICE_TYPE.UNKNOWN
    };
  }
}

/**
 * Normalize referrer URL for storage
 * - Removes protocol (https:// or http://) to save storage space
 * - Removes trailing slash for homepage (domain.com/ → domain.com)
 * - Keeps trailing slash for paths (domain.com/path/ stays as-is)
 * - Preserves query parameters and fragments
 *
 * @param referrer - Raw referrer URL from browser
 * @returns Normalized referrer string or null
 */
function normalizeReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;

  // Remove protocol (https:// or http://)
  let normalized = referrer.replace(/^https?:\/\//, '');

  // Remove trailing slash ONLY for homepage (domain.com/ → domain.com)
  // Pattern matches: domain.com/ or subdomain.domain.com/ (no path after slash)
  // Keeps: domain.com/path/ or domain.com/path?query
  if (/^[^\/]+\/$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Extract client IP address with comprehensive header detection
 * Supports Cloudflare, Nginx, and standard proxy headers
 *
 * Priority order (highest to lowest trust):
 * 1. CF-Connecting-IP (Cloudflare standard - most reliable for all plans)
 * 2. True-Client-IP (Cloudflare Enterprise - highest trust level)
 * 3. X-Real-IP (Nginx/proxy standard - commonly used)
 * 4. X-Forwarded-For (de-facto proxy standard - can be spoofed)
 * 5. CF-Pseudo-IPv4 (Cloudflare IPv6-to-IPv4 conversion fallback)
 *
 * Note: All extracted IPs are anonymized before processing/storage (privacy-first)
 *
 * @param req - Request object with headers
 * @returns Client IP address or 'unknown' if not found
 */
function extractClientIP(req: Request): string {
  // 1. CF-Connecting-IP (Cloudflare standard - always trustworthy)
  let ip = req.headers.get('cf-connecting-ip');
  if (ip) return ip.trim();

  // 2. True-Client-IP (Cloudflare Enterprise - highest trust level)
  ip = req.headers.get('true-client-ip');
  if (ip) return ip.trim();

  // 3. X-Real-IP (common in Nginx/proxy setups)
  ip = req.headers.get('x-real-ip');
  if (ip) return ip.trim();

  // 4. X-Forwarded-For (standard proxy header)
  // Format: "client, proxy1, proxy2" - first IP is the original client
  ip = req.headers.get('x-forwarded-for');
  if (ip) {
    const firstIP = ip.split(',')[0].trim();
    if (firstIP) return firstIP;
  }

  // 5. CF-Pseudo-IPv4 (Cloudflare IPv6-to-IPv4 conversion fallback)
  ip = req.headers.get('cf-pseudo-ipv4');
  if (ip) return ip.trim();

  // Fallback: No IP detected
  return 'unknown';
}

/**
 * Extract or generate request ID for end-to-end tracing
 *
 * Security: Only trusts CF-Ray header (set by Cloudflare, not client-spoofable)
 * Other headers like X-Request-ID can be spoofed by malicious clients
 * which could lead to log confusion or injection attacks.
 *
 * @param req - Request object with headers
 * @returns Request ID for tracing (CF-Ray or generated UUID)
 */
function getRequestId(req: Request): string {
  // Only trust CF-Ray - it's set by Cloudflare infrastructure, not spoofable
  // Other headers (x-request-id, x-correlation-id) can be client-injected
  return req.headers.get('cf-ray') || crypto.randomUUID();
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 * Server-side validation (second layer of defense)
 * @param input - String to sanitize
 * @param maxLength - Maximum allowed length
 * @returns Sanitized string or null
 */
function sanitizeInput(input: string | null | undefined, maxLength: number = MAX_STRING_LENGTH): string | null {
  if (!input) return null;

  let cleaned = String(input);

  // Limit length
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
  }

  // Remove dangerous patterns (XSS prevention)
  cleaned = cleaned
    .replace(/[<>'"]/g, '')           // HTML/JS special chars
    .replace(/javascript:/gi, '')     // JS protocol
    .replace(/on\w+=/gi, '')          // Event handlers
    .replace(/data:/gi, '')           // Data URLs
    .replace(/vbscript:/gi, '')       // VBScript
    .trim();

  return cleaned || null;
}

/**
 * Check if IP is private/reserved (not in public database)
 */
function isPrivateIP(ip: string): boolean {
  // IPv6 detection and handling
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    // ::1 (localhost), fc00::/7 (unique local), fe80::/10 (link-local)
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }

  // IPv4 handling
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return true;

  const [a, b] = parts;
  // 10.0.0.0/8, 172.16-31.x.x, 192.168.x.x, 127.x.x.x, 169.254.x.x
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127 || (a === 169 && b === 254);
}

/**
 * Check if a path looks like a local file system path (file:// protocol)
 * Used to detect local testing vs actual malformed requests
 */
function isLocalFilePath(path: string | null): boolean {
  if (!path) return false;
  // Windows: /C:/ or /D:/, macOS: /Users/, Linux: /home/
  return /^\/[A-Za-z]:\/|^\/Users\/|^\/home\//.test(path);
}

/**
 * Check if host is localhost or loopback address
 * Used to exclude local development traffic (e.g., via tunnels like ngrok)
 */
function isLocalhostHost(host: string): boolean {
  const h = host.split(':')[0].toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/**
 * Wrap async operation with timeout to prevent hanging requests
 * Uses Promise.race() to fail fast if operation takes too long
 *
 * @param promise - Promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operation - Operation name for logging
 * @param requestId - Request ID for tracing
 * @returns Promise result or throws timeout error
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
  requestId: string
): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[${requestId}] ${operation} failed:`, error);
    throw error;
  }
}

/**
 * Execute background task using EdgeRuntime.waitUntil if available
 * Falls back to fire-and-forget if EdgeRuntime is not available
 *
 * @param promise - Promise to execute in background
 * @param requestId - Request ID for logging
 */
function runInBackground(promise: Promise<unknown>, requestId: string): void {
  // Check if EdgeRuntime.waitUntil is available (Supabase Edge Functions)
  if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
    EdgeRuntime.waitUntil(promise);
  } else {
    // Fallback: fire-and-forget with error logging
    promise.catch(error => {
      console.error(`[${requestId}] Background task failed:`, error);
    });
  }
}

/**
 * Tinybird event structure for page view analytics
 */
interface TinybirdEvent {
  id: string;
  project_id: string;
  session_hash: string;
  page_host: string;
  page_path: string;
  page_title: string;
  referrer: string;
  referrer_domain: string;
  text_fragment: string;
  browser_name: string;
  os_name: string;
  device_type: string;
  geo_country_code: string;
  geo_country_name: string;
  geo_region_code: string;
  geo_region_name: string;
  geo_city_name: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  utm_id: string;
  utm_source_platform: string;
  utm_creative_format: string;
  utm_marketing_tactic: string;
  ref_source: string;
  ref_source_category: string;
  ref_bot: string;
  ref_bot_parent_name: string;
  ref_bot_category: string;
  ref_bot_user_agent: string;  // Full UA for unknown bots only (forensic analysis)
  // Engagement tracking fields (Plausible-style)
  event_type: string;
  engagement_time_ms: number;
  scroll_depth_percent: number;
  created_at: string;
}

/**
 * Send event to Tinybird with retry logic
 * Retries on transient errors (network, 429, 503, 504)
 *
 * @param event - Event object to send
 * @param requestId - Request ID for tracing
 * @param tinybirdApiUrl - Tinybird API URL
 * @param tinybirdIngestToken - Tinybird ingest token
 * @param maxAttempts - Maximum total attempts (default: 3 = 1 initial + 2 retries)
 * @returns Success status and attempt count
 */
async function sendToTinybirdWithRetry(
  event: TinybirdEvent,
  requestId: string,
  tinybirdApiUrl: string,
  tinybirdIngestToken: string,
  maxAttempts: number = 5
): Promise<{ success: boolean; attempts: number }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await withTimeout(
        fetch(
          `${tinybirdApiUrl}/v0/datasources?name=page_views_events&format=ndjson&mode=append`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tinybirdIngestToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(event) + '\n'
          }
        ),
        10000,
        'Tinybird ingestion',
        requestId
      );

      // Success!
      if (response.ok) {
        const result = await response.json();
        if (attempt > 1) {
          console.log(`[${requestId}] [TINYBIRD] Event ingested on retry ${attempt}:`, {
            successful_rows: result.successful_rows,
            project_id: event.project_id
          });
        } else {
          console.log(`[${requestId}] [TINYBIRD] Event ingested:`, {
            successful_rows: result.successful_rows,
            project_id: event.project_id
          });
        }
        return { success: true, attempts: attempt };
      }

      // Check if error is retryable
      const isRetryable =
        response.status === 429 ||  // Rate limit
        response.status === 503 ||  // Service unavailable
        response.status === 504;    // Gateway timeout

      // Read error text before deciding on retry
      const errorText = await response.text();

      if (!isRetryable || attempt === maxAttempts) {
        // Log error and event for recovery
        console.error(`[${requestId}] [TINYBIRD] Ingestion failed (attempt ${attempt}/${maxAttempts}):`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });

        // Last attempt - log full event for recovery
        if (attempt === maxAttempts) {
          console.error(`[${requestId}] [TINYBIRD_FAILURE] Event lost after ${maxAttempts} attempts:`,
            JSON.stringify(event)
          );
        }

        return { success: false, attempts: attempt };
      }

      // Calculate wait time: respect Retry-After header if present, otherwise use exponential backoff
      let waitMs = REQUEST_RETRY_MS * Math.pow(2, attempt - 1); // default: 1000ms, 2000ms, 4000ms

      // Parse Retry-After header from Tinybird (can be in header or error body)
      const retryAfterHeader = response.headers.get('retry-after');
      if (retryAfterHeader) {
        const retryAfterSec = parseInt(retryAfterHeader, 10);
        if (!isNaN(retryAfterSec) && retryAfterSec > 0) {
          waitMs = Math.max(waitMs, retryAfterSec * 1000);
        }
      } else {
        // Try to parse from error body: "retry after N second(s)"
        const retryMatch = errorText.match(/retry after (\d+) seconds?/i);
        if (retryMatch) {
          const retryAfterSec = parseInt(retryMatch[1], 10);
          if (!isNaN(retryAfterSec) && retryAfterSec > 0) {
            waitMs = Math.max(waitMs, retryAfterSec * 1000);
          }
        }
      }

      // Add jitter (10-30% random delay) to prevent thundering herd
      const jitter = waitMs * (0.1 + Math.random() * 0.2);
      waitMs = Math.ceil(waitMs + jitter);

      // Cap maximum wait at 15 seconds (edge function timeout consideration)
      waitMs = Math.min(waitMs, 15000);

      console.warn(`[${requestId}] [TINYBIRD] Retry ${attempt}/${maxAttempts} after ${waitMs}ms (status: ${response.status})`);
      await new Promise(resolve => setTimeout(resolve, waitMs));

    } catch (error) {
      // Network error - retry if not last attempt
      if (attempt === maxAttempts) {
        console.error(`[${requestId}] [TINYBIRD] Network error after ${maxAttempts} attempts:`, error);
        console.error(`[${requestId}] [TINYBIRD_FAILURE] Event lost (network error):`,
          JSON.stringify(event)
        );
        return { success: false, attempts: attempt };
      }

      // Wait before retry
      const waitMs = REQUEST_RETRY_MS * Math.pow(2, attempt - 1); // 1000ms, 2000ms, 4000ms
      console.warn(`[${requestId}] [TINYBIRD] Network error, retry ${attempt}/${maxAttempts} after ${waitMs}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  // This line should never be reached, but included for completeness
  return { success: false, attempts: maxAttempts };
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {

  // Extract request ID for end-to-end tracing
  const requestId = getRequestId(req);

  // Create response headers with request ID for tracing
  const headers = {
    ...corsHeaders,
    'X-Request-ID': requestId
  };

  // options request response
  console.log(`[${requestId}] "view" function, version: ${FUNCTION_VERSION}, method: ${req.method}`);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  // main function logic

  try {

    // ========================================================================
    // PHASE 1: SECURITY VALIDATION (Raw IP available for forensics)
    // ========================================================================
    // All payload validation happens BEFORE IP anonymization.
    // This allows logging full IP for malformed requests (security forensics).
    // GDPR: Logging raw IP for security is a legitimate interest (Article 6(1)(f))
    // ========================================================================

    // Get client IP address (RAW - not anonymized yet)
    // Supports: CF-Connecting-IP, True-Client-IP, X-Real-IP, X-Forwarded-For, CF-Pseudo-IPv4
    const rawIP = extractClientIP(req);

    // Private IP check - silent ignore (internal testing, not a security concern)
    if (isPrivateIP(rawIP)) {
      console.log(`[${requestId}] [PRIVATE_IP] Ignoring request from private IP`);
      return new Response(null, { status: 200, headers });
    }

    // --- Payload Size Validation (Content-Length early check) ---
    // Check Content-Length header first to reject large payloads before reading body
    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > MAX_PAYLOAD_BODY_SIZE) {
        logSecurityEvent(requestId, SECURITY_ERROR.PAYLOAD_TOO_LARGE, rawIP, req, {
          content_length_header: contentLength,
          max_size: MAX_PAYLOAD_BODY_SIZE
        });
        return createValidationErrorResponse(
          SECURITY_ERROR.PAYLOAD_TOO_LARGE,
          `Request body exceeds maximum size of ${MAX_PAYLOAD_BODY_SIZE} bytes`,
          headers
        );
      }
    }

    // Read body and verify actual size (Content-Length can be spoofed/missing)
    const rawBody = await req.text();
    if (rawBody.length > MAX_PAYLOAD_BODY_SIZE) {
      logSecurityEvent(requestId, SECURITY_ERROR.PAYLOAD_TOO_LARGE, rawIP, req, {
        payload_size: rawBody.length,
        max_size: MAX_PAYLOAD_BODY_SIZE
      });
      return createValidationErrorResponse(
        SECURITY_ERROR.PAYLOAD_TOO_LARGE,
        `Request body exceeds maximum size of ${MAX_PAYLOAD_BODY_SIZE} bytes`,
        headers
      );
    }

    // --- JSON Parse Validation ---
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      logSecurityEvent(requestId, SECURITY_ERROR.MALFORMED_JSON, rawIP, req, {
        error_message: e instanceof Error ? e.message : String(e),
        payload_size: rawBody.length,
        payload_preview: rawBody.slice(0, MAX_LOG_PAYLOAD_LENGTH)
      });
      return createValidationErrorResponse(
        SECURITY_ERROR.MALFORMED_JSON,
        'Unable to parse request body as JSON',
        headers
      );
    }

    // --- Required Fields Validation ---
    const page_host = sanitizeInput(body?.page_host, MAX_STRING_LENGTH);
    const page_path = sanitizeInput(body?.page_path, MAX_STRING_LENGTH);
    const created_at = sanitizeInput(body?.created_at, MAX_STRING_LENGTH);

    if (!page_host || !page_path || !created_at) {
      // Local file:// testing - silent ignore (developer testing, not malformed)
      if (!page_host && page_path && isLocalFilePath(page_path)) {
        console.log(`[${requestId}] [LOCAL_FILE] Ignoring local file:// request`);
        return new Response(null, { status: 200, headers });
      }

      const missingFields = [
        !page_host && 'page_host',
        !page_path && 'page_path',
        !created_at && 'created_at'
      ].filter(Boolean).join(', ');

      logSecurityEvent(requestId, SECURITY_ERROR.MISSING_REQUIRED_FIELDS, rawIP, req, {
        missing_fields: missingFields,
        page_host,
        page_path,
        created_at
      });
      return createValidationErrorResponse(
        SECURITY_ERROR.MISSING_REQUIRED_FIELDS,
        `Missing required fields: ${missingFields}`,
        headers
      );
    }

    // Localhost check - silent ignore (development testing, e.g., via tunnels)
    if (isLocalhostHost(page_host)) {
      console.log(`[${requestId}] [LOCALHOST] Ignoring localhost request`);
      return new Response(null, { status: 200, headers });
    }

    // --- Tracking ID Validation ---
    const data_key = sanitizeInput(body?.data_key, MAX_STRING_LENGTH);

    if (!data_key) {
      logSecurityEvent(requestId, SECURITY_ERROR.MISSING_TRACKING_ID, rawIP, req, {
        page_host,
        page_path
      });
      return createValidationErrorResponse(
        SECURITY_ERROR.MISSING_TRACKING_ID,
        'data_key (tracking ID) is required',
        headers
      );
    }

    if (!isValidTrackingId(data_key)) {
      logSecurityEvent(requestId, SECURITY_ERROR.INVALID_TRACKING_ID, rawIP, req, {
        data_key_length: data_key.length,
        data_key_preview: data_key.slice(0, 20) + (data_key.length > 20 ? '...' : ''),
        page_host,
        page_path
      });
      return createValidationErrorResponse(
        SECURITY_ERROR.INVALID_TRACKING_ID,
        'Tracking ID must be a valid UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
        headers
      );
    }

    // [FUTURE: Rate limiting check here using rawIP]
    // const rateLimit = checkRateLimit(rawIP);
    // if (!rateLimit.allowed) { return ... }

    // ========================================================================
    // PHASE 2: PRIVACY PROCESSING
    // ========================================================================
    // All validation passed - this looks like a legitimate request.
    //
    // IP Address Usage:
    // - rawIP (full): Used ONLY for geo-location lookup (city-level accuracy)
    // - ipAddress (anonymized): Used for session hash and all other processing
    //
    // This matches Plausible/GA4 approach where geo lookup uses full IP
    // for accuracy, but storage/hashing uses anonymized IP for privacy.
    // The full IP is already logged by Supabase/Cloudflare anyway.
    // ========================================================================

    let ipAddress = anonymizeIP(rawIP) || 'unknown';
    if (ipAddress === 'unknown') {
      console.warn(`[${requestId}] [SECURITY] IP anonymization failed for valid request`);
      return new Response(null, { status: 200, headers });
    }


    const page_title = sanitizeInput(body?.page_title, MAX_STRING_LENGTH);
    const referrer = normalizeReferrer(sanitizeInput(body?.referrer, MAX_STRING_LENGTH));

    // Extract domain from referrer for analytics grouping (lowercase for consistency)
    const referrerDomain = referrer
      ? referrer.split('/')[0].replace(/^www\./, '').toLowerCase()
      : '';

    const text_fragment = sanitizeInput(body?.text_fragment, MAX_STRING_LENGTH);
    const utm_source = sanitizeInput(body.utm_source, MAX_UTM_LENGTH);
    const utm_medium = sanitizeInput(body.utm_medium, MAX_UTM_LENGTH);
    const utm_campaign = sanitizeInput(body.utm_campaign, MAX_UTM_LENGTH);
    const utm_content = sanitizeInput(body.utm_content, MAX_UTM_LENGTH);
    const utm_term = sanitizeInput(body.utm_term, MAX_UTM_LENGTH);
    const utm_id = sanitizeInput(body.utm_id, MAX_UTM_LENGTH);
    const utm_source_platform = sanitizeInput(body.utm_source_platform, MAX_UTM_LENGTH);
    const utm_creative_format = sanitizeInput(body.utm_creative_format, MAX_UTM_LENGTH);
    const utm_marketing_tactic = sanitizeInput(body.utm_marketing_tactic, MAX_UTM_LENGTH);

    // ========================================================================
    // Event Type Detection & Engagement Parsing (Plausible-style)
    // ========================================================================
    const event_type = sanitizeInput(body?.event_type, 20) || 'pageview';
    const isEngagementEvent = event_type === 'engagement';
    const isSummarizeClickEvent = event_type === 'summarize_click';
    const isSummarizeOpenedEvent = event_type === 'summarize_opened';
    const isShareClickEvent = event_type === 'share_click';

    // Combined check for fast-path events (skip expensive UA/geo/source detection)
    const isFastPathEvent = isEngagementEvent || isSummarizeClickEvent || isSummarizeOpenedEvent || isShareClickEvent;

    // Summarize/Share click event - parse service name (AI service or share service)
    const ai_service = (isSummarizeClickEvent || isShareClickEvent) ? sanitizeInput(body?.ai_service, 50) : null;

    let engagement_time_ms = 0;
    let scroll_depth_percent = 0;

    if (isEngagementEvent) {
      // Parse engagement time
      const rawTime = parseInt(body?.engagement_time_ms, 10);
      if (!isNaN(rawTime) && rawTime > 0) {
        // Cap at 1 hour to prevent abuse
        engagement_time_ms = Math.min(rawTime, 3600000);
      }

      // Parse scroll depth (0-100%)
      const rawScroll = parseInt(body?.scroll_depth_percent, 10);
      if (!isNaN(rawScroll) && rawScroll >= 0 && rawScroll <= 100) {
        scroll_depth_percent = rawScroll;
      }

      // Plausible sends engagement when: (scrollDepth > previousMax) OR (engagementTime >= 3000ms)
      // Server-side: reject if BOTH scroll_depth is 0 AND time < 3000ms
      // (We can't track previousMax server-side, so accept any scroll_depth > 0 OR time >= 3000ms)
      if (scroll_depth_percent === 0 && engagement_time_ms < 3000) {
        console.log(`[${requestId}] Engagement event below threshold (${engagement_time_ms}ms, ${scroll_depth_percent}%), ignoring`);
        return new Response(null, { status: 200, headers });
      }

      console.log(`[${requestId}] Processing engagement: ${engagement_time_ms}ms, ${scroll_depth_percent}% scroll`);
    }

    // ========================================================================
    // Bot Detection (BEFORE DB queries for performance)
    // ========================================================================
    // Robustly extract user agent header (case-insensitive per spec)
    let user_agent = req.headers.get('user-agent');
    if (!user_agent) {
      // Look for other case variations if primary is missing (defensive)
      for (const [name, value] of req.headers.entries()) {
        if (name.toLowerCase() === 'user-agent') {
          user_agent = value;
          break;
        }
      }
    }

    // Detect bot (will be tracked with fast path after validation)
    const botDetection = detectBotFromUA(user_agent);

    // now create supabase db client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ========================================================================
    // Project Lookup (Simplified - uses projects_new table synced from Rails)
    // ========================================================================
    // Rails is the source of truth for user/project management.
    // This table only contains: tracking_id, domain, is_active
    // No subscription checks needed - is_active reflects subscription status from Rails
    // ========================================================================

    console.log(`[${requestId}] Finding project, data_key:`, data_key);
    const { data: project, error: projectError } = await withTimeout(
      supabaseClient
        .from('projects_new')
        .select('tracking_id, domain, is_active')
        .eq('tracking_id', data_key)
        .single(),
      3000,  // Faster timeout - simple lookup
      'Project lookup',
      requestId
    );

    if (projectError || !project) {
      console.log(`[${requestId}] Project not found:`, data_key);
      return new Response(null, { status: 200, headers });
    }

    // Check if project is active (subscription status managed in Rails)
    if (!project.is_active) {
      console.log(`[${requestId}] Project inactive:`, data_key);
      return new Response(null, { status: 200, headers });
    }

    // ========================================================================
    // Domain Security Validation
    // ========================================================================

    // Extract domain from Origin header (browser-controlled) or page_host (fallback)
    const requestDomain = extractRequestDomain(req, page_host);

    // Validate domain (null requestDomain = direct navigation/bookmark, allow)
    if (requestDomain && !isAllowedDomain(requestDomain, project.domain)) {
      console.log(`[${requestId}] [SECURITY] Domain mismatch:`, {
        requestDomain,
        projectDomain: project.domain
      });

      // fail silently - allow the request to continue, but don't record the page view
      return new Response(null, { status: 200, headers });
    }

    console.log(`[${requestId}] [SECURITY] Domain validated:`, {
      requestDomain,
      projectDomain: project.domain
    });

    // ========================================================================
    // Privacy-First Session Tracking & User Agent Parsing
    // ========================================================================

    // Extract page_host from client or fallback to URL parsing
    const websiteHost = page_host;

    // ========================================================================
    // Bot Fast Path - Track bots with minimal processing
    // ========================================================================
    if (botDetection.isBot) {
      console.log(`[${requestId}] Bot detected: ${botDetection.botParentName} (${botDetection.botCategory})`);

      // Get daily salt and generate session hash (needed for all events)
      const dailySalt = await getDailySalt(supabaseClient, requestId);
      const sanitizedHost = sanitizeInput(websiteHost, MAX_STRING_LENGTH) || '';
      const sessionHash = await generateSessionHash(dailySalt, ipAddress, user_agent || '', sanitizedHost);

      // Minimal bot event - skip geo, UA parsing, visitor source detection
      const botEvent: TinybirdEvent = {
        id: crypto.randomUUID(),
        project_id: project.tracking_id,
        session_hash: sessionHash,
        page_host: sanitizedHost,
        page_path: page_path || '',
        page_title: '',
        referrer: '',
        referrer_domain: '',
        text_fragment: '',
        browser_name: '',
        os_name: '',
        device_type: '',
        geo_country_code: 'ZZ',  // ISO 3166-1 for unknown country
        geo_country_name: '',
        geo_region_code: '',
        geo_region_name: '',
        geo_city_name: '',
        utm_source: '',
        utm_medium: '',
        utm_campaign: '',
        utm_content: '',
        utm_term: '',
        utm_id: '',
        utm_source_platform: '',
        utm_creative_format: '',
        utm_marketing_tactic: '',
        ref_source: '',
        ref_source_category: '',
        ref_bot: botDetection.matchedPattern || '',
        ref_bot_parent_name: botDetection.botParentName || '',
        ref_bot_category: botDetection.botCategory || '',
        ref_bot_user_agent: botDetection.rawUserAgent || '',  // Full UA for unknown bots
        event_type: 'bot',
        engagement_time_ms: 0,
        scroll_depth_percent: 0,
        created_at: created_at,
      };

      // Send to Tinybird (non-blocking background task)
      const TINYBIRD_API_URL = Deno.env.get('TINYBIRD_API_URL');
      const TINYBIRD_INGEST_TOKEN = Deno.env.get('TINYBIRD_INGEST_TOKEN');
      if (TINYBIRD_API_URL && TINYBIRD_INGEST_TOKEN) {
        // Use runInBackground for safe background execution with fallback
        runInBackground(
          sendToTinybirdWithRetry(botEvent, requestId, TINYBIRD_API_URL, TINYBIRD_INGEST_TOKEN, 5),
          requestId
        );
      } else {
        console.error(`[${requestId}] Missing Tinybird env vars - bot event not sent`);
      }

      return new Response(null, { status: 200, headers });
    }

    // ========================================================================
    // Conditional Processing Based on Event Type (Engagement Fast Path)
    // ========================================================================
    // Engagement events skip expensive operations (geo lookup, visitor source
    // detection, UA parsing) since this data was already captured in the pageview.
    // Events are linked via session_hash.
    // ========================================================================

    // Initialize with defaults - will be populated for pageview events only
    let uaData = {
      browser_name: '',
      os_name: '',
      device_type: DEVICE_TYPE.UNKNOWN as string
    };
    let finalDeviceType = DEVICE_TYPE.UNKNOWN;
    let visitorSource: VisitorSourceDetectionResult = {
      visitor_source: undefined,
      bot_source: undefined
    };
    let geoData: {
      country_code?: string;
      country_name?: string;
      region_name?: string;
      city_name?: string;
    } | null = null;

    if (!isFastPathEvent) {
      // ====================================================================
      // PAGEVIEW: Full processing
      // ====================================================================

      // Parse user agent into structured data (browser, OS, device type)
      // Raw user agent is NOT stored in database (privacy-first)
      uaData = parseUserAgent(user_agent, requestId);

      // Device type detection: UA-parsed (mobile/tablet/console/smarttv/wearable) → DESKTOP (fallback)
      // If UA parser detects a specific device type, use it; otherwise default to desktop
      finalDeviceType = uaData.device_type || DEVICE_TYPE.DESKTOP;

      // ====================================================================
      // AI Traffic Detection & Geo-Location
      // ====================================================================

      // Detect AI traffic
      const utmParams: UtmParams = {
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        utm_id,
        utm_source_platform,
        utm_creative_format,
        utm_marketing_tactic
      };

      // Detect visitor source and bot source
      try {
        visitorSource = await withTimeout(
          findVisitorSource(
            {
              //ip_address: rawIP, // disabled for now
              user_agent: user_agent || '',
              referrer: referrer || '',
              utm_params: utmParams,
              text_fragment: text_fragment || '',
              supabase_client: supabaseClient
            }
          ),
          3000, // 3 second timeout (includes DB lookup for bot detection)
          'Visitor source detection',
          requestId
        );
      } catch (error) {
        console.error(`[${requestId}] Visitor source detection failed:`, error);
        // Continue without visitor source detection (graceful degradation)
        visitorSource = { visitor_source: undefined, bot_source: undefined };
      }

      // Detect geo-location from IP address and Cloudflare headers
      // NOTE: Using FULL IP (rawIP) for city-level accuracy
      // This matches Plausible/GA4 approach: geo lookup BEFORE anonymization
      // The full IP is already logged by Supabase/Cloudflare infrastructure anyway
      // See: https://plausible.io/data-policy (geo lookup uses full IP, then discards)
      geoData = await withTimeout(
        detectGeoLocation(rawIP, req.headers, supabaseClient),
        5000,
        'Geo-location lookup',
        requestId
      );
    } else {
      // ====================================================================
      // ENGAGEMENT/SUMMARIZE_CLICK/SUMMARIZE_OPENED/SHARE_CLICK: Fast path - skip expensive operations
      // ====================================================================
      // Session hash still generated below (needed to link to pageview)
      // All other data was already captured in the pageview event
      const eventLabel = isEngagementEvent ? 'Engagement' :
                        isSummarizeClickEvent ? 'Summarize click' :
                        isShareClickEvent ? 'Share click' : 'Summarize opened';
      console.log(`[${requestId}] ${eventLabel} event fast path - skipping geo/UA/source detection`);
    }

    // ========================================================================
    // Privacy-First Session Tracking (Matomo + Plausible-style)
    // ========================================================================
    // PRIVACY NOTE: IP address is ANONYMIZED before session hash generation
    // (last 2 parts removed: 192.168.1.100 → 192.168.0.0 for IPv4)
    // This provides an extra privacy layer beyond daily salt rotation.
    //
    // Session hash changes daily when salt rotates → no cross-day tracking
    // Cannot reverse-engineer IP from hash → 2^128 possible salts
    // Per-website isolation → same user, different hash per domain
    // IP anonymization → even the hash doesn't contain full IP information
    //
    // Trade-off: Slightly less unique sessions (users sharing same /16 network
    // will have same session hash), but acceptable for privacy-first approach.
    //
    // References:
    // - Plausible: https://plausible.io/data-policy#how-we-count-unique-users-without-cookies
    // - Matomo: https://matomo.org/faq/general/configure-privacy-settings-in-matomo/
    const dailySalt = await getDailySalt(supabaseClient, requestId);


    const sessionHash = await generateSessionHash(
      dailySalt,
      ipAddress,           // <-- Anonymized IP (privacy-first for session tracking)
      user_agent || '',
      websiteHost
    );

    // Current timestamp for event creation
    const now = new Date();

    // DO NOT WRITE billing counter for now - we will be running cron to check number of events instead
    /*
    // ========================================================================
    // Increment billing counter in Supabase (monthly_view_usage)
    // ========================================================================
    const { error: usageError } = await supabaseClient
      .from('monthly_view_usage')
      .upsert({
        user_id: project.user_id,
        year: currentYear,
        month: currentMonth,
        view_count: currentViewCount + 1,
        updated_at: now.toISOString()
      }, {
        onConflict: 'user_id,year,month'
      });

    if (usageError) {
      console.error('Failed to update monthly view usage:', usageError);
      // Don't fail the request - tracking is more important than counter
    }
    */
    // ========================================================================
    // Send event to Tinybird Events API (analytics storage)
    // ========================================================================

    const tinybirdEvent: TinybirdEvent = {
      id: crypto.randomUUID(),
      project_id: project.tracking_id,
      session_hash: sessionHash,
      page_host: sanitizeInput(websiteHost, MAX_STRING_LENGTH) || '',
      page_path: page_path || '',
      // For engagement/summarize_click/share_click events, skip fields already captured in pageview
      page_title: (isEngagementEvent || isSummarizeClickEvent || isShareClickEvent) ? '' : (page_title || ''),
      referrer: (isEngagementEvent || isSummarizeClickEvent || isShareClickEvent) ? '' : (referrer || ''),
      referrer_domain: (isEngagementEvent || isSummarizeClickEvent || isShareClickEvent) ? '' : (referrerDomain || ''),
      text_fragment: (isEngagementEvent || isSummarizeClickEvent || isShareClickEvent) ? '' : (text_fragment || ''),
      browser_name: (isEngagementEvent || isSummarizeClickEvent || isShareClickEvent) ? '' : (uaData.browser_name || ''),
      os_name: (isEngagementEvent || isSummarizeClickEvent || isShareClickEvent) ? '' : (uaData.os_name || ''),
      device_type: (isEngagementEvent || isSummarizeClickEvent || isShareClickEvent) ? '' : finalDeviceType,
      geo_country_code: (isEngagementEvent || isSummarizeClickEvent || isShareClickEvent) ? '' : (geoData?.country_code || 'ZZ'),
      geo_country_name: '',  // Deprecated: frontend resolves names via Intl.DisplayNames
      geo_region_code: '', // nor region code, we only store region name
      geo_region_name: isFastPathEvent ? '' : (geoData?.region_name || ''),
      geo_city_name: isFastPathEvent ? '' : (geoData?.city_name || ''),
      // utm parameters (skip for fast path events)
      utm_source: isFastPathEvent ? '' : (utm_source || ''),
      utm_medium: isFastPathEvent ? '' : (utm_medium || ''),
      utm_campaign: isFastPathEvent ? '' : (utm_campaign || ''),
      utm_content: isFastPathEvent ? '' : (utm_content || ''),
      utm_term: isFastPathEvent ? '' : (utm_term || ''),
      utm_id: isFastPathEvent ? '' : (utm_id || ''),
      utm_source_platform: isFastPathEvent ? '' : (utm_source_platform || ''),
      utm_creative_format: isFastPathEvent ? '' : (utm_creative_format || ''),
      utm_marketing_tactic: isFastPathEvent ? '' : (utm_marketing_tactic || ''),
      // For summarize_click/share_click: store service name in ref_source field
      // For summarize_opened: leave ref_source empty (no service selected yet)
      ref_source: (isSummarizeClickEvent || isShareClickEvent) ? (ai_service || '') : (isFastPathEvent ? '' : (visitorSource?.visitor_source?.name ?? '')),
      ref_source_category: isFastPathEvent ? '' : (visitorSource?.visitor_source?.category ?? ''),
      ref_bot: isFastPathEvent ? '' : (visitorSource?.matched_bot_pattern ?? ''),
      ref_bot_parent_name: isFastPathEvent ? '' : (visitorSource?.bot_source?.ref_bot_parent_name ?? ''),
      ref_bot_category: isFastPathEvent ? '' : (visitorSource?.bot_source?.ref_bot_category ?? ''),
      ref_bot_user_agent: isFastPathEvent ? '' : (visitorSource?.rawUserAgent ?? ''),  // Full UA for unknown bots
      // Engagement tracking fields (Plausible-style)
      event_type: event_type,
      engagement_time_ms: engagement_time_ms,
      scroll_depth_percent: scroll_depth_percent,
      created_at: created_at,
    };

    // Send to Tinybird (non-blocking background task)
    const TINYBIRD_API_URL = Deno.env.get('TINYBIRD_API_URL');
    const TINYBIRD_INGEST_TOKEN = Deno.env.get('TINYBIRD_INGEST_TOKEN');

    if (!TINYBIRD_API_URL || !TINYBIRD_INGEST_TOKEN) {
      console.error(`[${requestId}] [CRITICAL] Tinybird config missing`);
      console.error(`[${requestId}] [TINYBIRD_FAILURE] Event lost (config missing):`,
        JSON.stringify(tinybirdEvent)
      );
      return new Response(null, { status: 200, headers });
    }

    // Use runInBackground for safe background execution with fallback
    // Errors are logged inside sendToTinybirdWithRetry, no need to check result
    runInBackground(
      sendToTinybirdWithRetry(
        tinybirdEvent,
        requestId,
        TINYBIRD_API_URL,
        TINYBIRD_INGEST_TOKEN,
        5  // 5 total attempts (1 initial + 4 retries)
      ),
      requestId
    );

    return new Response(null, { status: 200, headers });

  } catch (error) {
    console.error(`[${requestId}] Error processing page view:`, error);
    return new Response(null, { status: 200, headers });
  }
});
