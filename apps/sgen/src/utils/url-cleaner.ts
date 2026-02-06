/**
 * URL cleaning utility - removes marketing/tracking parameters from external URLs
 * Preserves tracking params on project's own URLs for analytics purposes
 */

/**
 * Marketing/tracking URL parameters to remove from EXTERNAL links only
 */
const TRACKING_PARAMS = [
  // UTM tracking
  /^utm_/i,
  // Click IDs
  /^gclid$/i,
  /^fbclid$/i,
  /^msclkid$/i,
  /^dclid$/i,
  /^yclid$/i,
  // Share tracking
  /^si$/i,
  /^ref$/i,
  // Analytics
  /^_ga$/i,
  /^_gl$/i,
  // Mailchimp
  /^mc_/i,
];

/**
 * Extract hostname from URL for comparison
 */
function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if URL belongs to the project's own website
 */
function isProjectUrl(url: string, projectUrl?: string): boolean {
  if (!projectUrl) return false;

  const urlHost = getHostname(url);
  const projectHost = getHostname(projectUrl);

  if (!urlHost || !projectHost) return false;

  // Match exact domain or subdomains (e.g., blog.example.com matches example.com)
  return urlHost === projectHost || urlHost.endsWith('.' + projectHost);
}

/**
 * Clean tracking parameters from a single URL
 * Skips cleaning if URL belongs to project website (preserves own UTM tracking)
 */
export function cleanUrl(url: string, projectUrl?: string): string {
  // Don't clean project's own URLs - preserve their tracking params
  if (isProjectUrl(url, projectUrl)) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);

    for (const key of [...params.keys()]) {
      if (TRACKING_PARAMS.some(pattern => pattern.test(key))) {
        params.delete(key);
      }
    }

    parsed.search = params.toString();
    return parsed.toString();
  } catch {
    return url; // Return original if invalid URL
  }
}

/**
 * Clean all URLs in markdown content
 * Preserves tracking params on links to the project's own website
 */
export function cleanMarkdownUrls(content: string, projectUrl?: string): string {
  // Match markdown links: [text](url)
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;

  return content.replace(linkRegex, (match, text, url) => {
    const cleanedUrl = cleanUrl(url, projectUrl);
    return `[${text}](${cleanedUrl})`;
  });
}
