/**
 * Domain Validation Module
 *
 * Security: Only allow tracking from project's registered domain and its subdomains
 * Blocks: localhost, 127.0.0.1, and all unauthorized domains
 */

/**
 * Normalize domain: lowercase and strip www prefix
 * @param domain - Raw domain string
 * @returns Normalized domain
 */
export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '');
}

/**
 * Check if request domain is allowed for this project
 * Allows: exact match OR subdomain of project.domain
 * Blocks: localhost, 127.0.0.1, and all other domains
 *
 * @param requestDomain - Domain from request (Origin header or page_host)
 * @param projectDomain - Registered domain from projects.domain
 * @returns true if allowed, false if blocked
 */
export function isAllowedDomain(
  requestDomain: string,
  projectDomain: string
): boolean {
  const normalized = normalizeDomain(requestDomain);
  const projectBase = normalizeDomain(projectDomain);

  // 1. Exact match
  if (normalized === projectBase) {
    return true;
  }

  // 2. Subdomain match (blog.example.com matches example.com)
  if (normalized.endsWith('.' + projectBase)) {
    return true;
  }

  // 3. Everything else is blocked (including localhost)
  return false;
}

/**
 * Extract domain from request headers
 * Priority: Origin header (most secure) → Referer header → page_host (fallback)
 *
 * @param req - Request object
 * @param pageHost - Client-provided page_host from request body
 * @returns Extracted domain or null if not available
 */
export function extractRequestDomain(
  req: Request,
  pageHost: string | null
): string | null {
  // Priority 1: Origin header (browser-controlled, cannot be faked by JavaScript)
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const url = new URL(origin);
      return normalizeDomain(url.hostname);
    } catch (e) {
      console.warn('[SECURITY] Invalid Origin header:', origin);
    }
  } else {
    console.warn('[SECURITY] No Origin header found!');
  }

  // Priority 2: page_host from client (can be spoofed in non-browser contexts)
  if (pageHost) {
    console.warn('[SECURITY] using page_host from client:', pageHost);
    return normalizeDomain(pageHost);
  }

  return null;
}
