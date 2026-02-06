/**
 * Sitemap XML Parser
 *
 * Parses sitemap.xml content and extracts URLs with auto-generated titles.
 * Optimized for prompt context: returns compact { slug, title } array.
 */

export interface SitemapLink {
  slug: string;
  title: string;
}

/**
 * Parse sitemap XML and extract URLs with titles
 *
 * @param xml - Raw sitemap XML content
 * @param baseUrl - Base URL for relative path extraction (unused but kept for API consistency)
 * @returns Array of { slug, title } for internal linking
 */
export function parseSitemapForPrompt(xml: string, baseUrl: string): SitemapLink[] {
  const links: SitemapLink[] = [];
  const urlMatches = xml.match(/<url>([\s\S]*?)<\/url>/g) || [];

  for (const block of urlMatches) {
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
    if (!locMatch) continue;

    const urlStr = locMatch[1].trim();

    try {
      const parsedUrl = new URL(urlStr);
      const slug = parsedUrl.pathname; // e.g., "/blog/my-post"

      // Skip root path and common non-article paths
      if (slug === '/' || slug === '') continue;

      // Generate title from slug: /blog/my-post → "My Post"
      const segments = slug.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1] || '';

      // Skip common utility paths
      if (['sitemap', 'feed', 'rss', 'api', 'admin'].includes(lastSegment.toLowerCase())) {
        continue;
      }

      const title = lastSegment
        .replace(/-/g, ' ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      links.push({ slug, title });
    } catch {
      // Invalid URL, skip
    }
  }

  return links;
}

/**
 * Format sitemap links for prompt template
 *
 * @param links - Array of SitemapLink
 * @returns Markdown formatted list for {{links}} variable
 */
export function formatLinksForPrompt(links: SitemapLink[]): string {
  return links.map((l) => `- [${l.title}](${l.slug})`).join('\n');
}
