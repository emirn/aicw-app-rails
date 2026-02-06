/**
 * Sitemap fetcher for existing page context
 * Used to populate pages_published for internal linking
 */

import { IPage } from './types';

export interface SitemapPage {
  url: string;
  title: string;
  lastmod?: string;
}

/**
 * Fetch and parse sitemap.xml from a website
 */
export async function fetchSitemap(baseUrl: string): Promise<SitemapPage[]> {
  const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();

  try {
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    return parseSitemapXml(xml, baseUrl);
  } catch (error: any) {
    throw new Error(`Failed to fetch sitemap from ${sitemapUrl}: ${error.message}`);
  }
}

/**
 * Parse sitemap XML and extract URLs
 */
function parseSitemapXml(xml: string, baseUrl: string): SitemapPage[] {
  const pages: SitemapPage[] = [];

  // Extract <url> blocks
  const urlRegex = /<url>([\s\S]*?)<\/url>/g;
  let match;

  while ((match = urlRegex.exec(xml)) !== null) {
    const urlBlock = match[1];

    // Extract <loc>
    const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/);
    if (!locMatch) continue;

    const url = locMatch[1].trim();

    // Extract <lastmod> if present
    const lastmodMatch = urlBlock.match(/<lastmod>([^<]+)<\/lastmod>/);
    const lastmod = lastmodMatch ? lastmodMatch[1].trim() : undefined;

    // Generate title from URL path
    const title = titleFromUrl(url, baseUrl);

    pages.push({ url, title, lastmod });
  }

  return pages;
}

/**
 * Generate a readable title from URL path
 * e.g., /blog/react-performance-tips -> "React Performance Tips"
 */
function titleFromUrl(url: string, baseUrl: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // Remove leading/trailing slashes and split
    const segments = path.replace(/^\/|\/$/g, '').split('/');

    // Take the last segment (usually the slug)
    const slug = segments[segments.length - 1] || 'Home';

    // Convert slug to title case
    return slug
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || 'Home';
  } catch {
    return 'Page';
  }
}

/**
 * Convert SitemapPage array to IPage format for pipeline
 */
export function sitemapPagesToIPages(pages: SitemapPage[]): IPage[] {
  return pages.map((page, index) => {
    // Extract slug from URL path
    let slug = '';
    try {
      const urlObj = new URL(page.url);
      slug = urlObj.pathname.replace(/^\/|\/$/g, '').split('/').pop() || '';
    } catch {
      slug = `page-${index + 1}`;
    }

    return {
      id: `sitemap-page-${index + 1}`,
      slug,
      title: page.title,
      description: page.title, // Use title as description fallback
      keywords: '',
    };
  });
}
