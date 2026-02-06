/**
 * Project Name Normalization Utilities
 *
 * Converts customer domains to valid Cloudflare Pages project names
 * and validates domain formats.
 */

// Base domain for customer site subdomains
// Sites are published as: <projectName>.sites.pgndr.com
export const SITES_BASE_DOMAIN = 'pgndr.com';
export const SITES_SUBDOMAIN_PREFIX = 'sites';  // Creates *.sites.pgndr.com

// Reserved subdomains that cannot be used for customer sites
const RESERVED_SUBDOMAINS = new Set([
  'app',
  'cdn',
  'www',
  'api',
  'builder',
  'admin',
  'dashboard',
  'mail',
  'smtp',
  'ftp',
  'ns1',
  'ns2'
]);

// Common TLDs for validation (not exhaustive, but covers most cases)
const COMMON_TLDS = new Set([
  'com', 'net', 'org', 'io', 'co', 'ai', 'app', 'dev', 'me', 'us', 'uk', 'de',
  'fr', 'es', 'it', 'nl', 'be', 'ch', 'at', 'ca', 'au', 'nz', 'in', 'jp', 'cn',
  'kr', 'br', 'mx', 'ru', 'pl', 'se', 'no', 'fi', 'dk', 'ie', 'pt', 'cz', 'hu',
  'ro', 'bg', 'gr', 'tr', 'za', 'eg', 'ae', 'sg', 'hk', 'tw', 'my', 'th', 'ph',
  'id', 'vn', 'info', 'biz', 'xyz', 'online', 'store', 'shop', 'blog', 'site',
  'tech', 'cloud', 'digital', 'media', 'agency', 'studio', 'design', 'marketing',
  // Two-part TLDs
  'co.uk', 'co.nz', 'co.za', 'co.in', 'co.jp', 'co.kr',
  'com.au', 'com.br', 'com.mx', 'com.ar', 'com.cn', 'com.tw', 'com.hk', 'com.sg',
  'org.uk', 'org.au', 'net.au', 'edu.au', 'gov.au'
]);

/**
 * Normalize a customer domain into a valid project name
 *
 * Examples:
 *   blog.mysite.com → blog-mysite-com
 *   www.acme.io → www-acme-io
 *   shop.example.co.uk → shop-example-co-uk
 *
 * @param {string} domain - Customer's target domain
 * @returns {string} Normalized project name
 */
export function normalizeProjectName(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Domain is required');
  }

  return domain
    .toLowerCase()
    .trim()
    .replace(/\./g, '-')           // Replace dots with hyphens
    .replace(/[^a-z0-9-]/g, '')    // Remove invalid chars
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
    .slice(0, 63);                 // Max 63 chars (DNS label limit)
}

/**
 * Validate that a string looks like a valid domain
 *
 * Requirements:
 *   - Contains at least one dot
 *   - Ends with a recognized TLD
 *   - Not a reserved subdomain
 *   - Results in a project name ≤ 63 chars
 *
 * @param {string} domain - Domain to validate
 * @returns {{ valid: boolean, error?: string, projectName?: string }}
 */
export function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, error: 'Domain is required' };
  }

  const cleaned = domain.toLowerCase().trim();

  // Must contain at least one dot
  if (!cleaned.includes('.')) {
    return { valid: false, error: 'Domain must contain at least one dot (e.g., blog.site.com)' };
  }

  // Check for valid TLD
  const parts = cleaned.split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'Invalid domain format' };
  }

  // Check two-part TLDs first (e.g., co.uk)
  const lastTwo = parts.slice(-2).join('.');
  const lastOne = parts[parts.length - 1];

  const hasTwoPartTld = COMMON_TLDS.has(lastTwo);
  const hasOnePartTld = COMMON_TLDS.has(lastOne);

  if (!hasTwoPartTld && !hasOnePartTld) {
    return { valid: false, error: `Unrecognized TLD: .${lastOne}` };
  }

  // Normalize and check length
  const projectName = normalizeProjectName(cleaned);

  if (projectName.length === 0) {
    return { valid: false, error: 'Domain results in empty project name' };
  }

  if (projectName.length > 63) {
    return { valid: false, error: 'Project name exceeds 63 characters (DNS limit)' };
  }

  // Check reserved names
  if (RESERVED_SUBDOMAINS.has(projectName)) {
    return { valid: false, error: `"${projectName}" is a reserved name` };
  }

  return { valid: true, projectName };
}

/**
 * Get the subdomain hostname for a project (without https://)
 *
 * @param {string} projectName - Normalized project name
 * @returns {string} Hostname like prod-test-blog.sites.pgndr.com
 */
export function getSitesHostname(projectName) {
  if (SITES_SUBDOMAIN_PREFIX) {
    return `${projectName}.${SITES_SUBDOMAIN_PREFIX}.${SITES_BASE_DOMAIN}`;
  }
  return `${projectName}.${SITES_BASE_DOMAIN}`;
}

/**
 * Get the sites.aicw.io subdomain URL for a project
 *
 * @param {string} projectName - Normalized project name
 * @returns {string} Full URL like https://blog-mysite-com.sites.aicw.io
 */
export function getSitesSubdomain(projectName) {
  return `https://${getSitesHostname(projectName)}`;
}

/**
 * Get the pages.dev URL for a project
 *
 * @param {string} projectName - Cloudflare Pages project name
 * @returns {string} Full URL like https://blog-mysite-com.pages.dev
 */
export function getPagesDevUrl(projectName) {
  return `https://${projectName}.pages.dev`;
}

export default {
  normalizeProjectName,
  validateDomain,
  getSitesSubdomain,
  getSitesHostname,
  getPagesDevUrl,
  RESERVED_SUBDOMAINS,
  SITES_BASE_DOMAIN,
  SITES_SUBDOMAIN_PREFIX
};
