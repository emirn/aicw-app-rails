/**
 * OG Image Source Selector
 *
 * Determines which image to use as the background for OG image generation.
 * Priority:
 * 1. image_hero from frontmatter
 * 2. First image extracted from markdown body
 * 3. Fall back to gradient-only design
 */

import type { CollectionEntry } from 'astro:content';

export interface OGImageSource {
  type: 'hero' | 'content_image' | 'gradient';
  /** Relative path to image (e.g., "/assets/blog/my-post/hero.webp") */
  path?: string;
}

/**
 * Extract the first image URL from markdown content
 * Matches: ![alt](path.ext) or standard img paths
 */
function extractFirstImage(markdownContent: string): string | null {
  if (!markdownContent) return null;

  // Match markdown image syntax: ![alt](url)
  const markdownImageRegex = /!\[.*?\]\(([^)]+\.(?:webp|png|jpg|jpeg))\)/i;
  const match = markdownContent.match(markdownImageRegex);

  if (match && match[1]) {
    return match[1];
  }

  // Match HTML img src attribute
  const htmlImageRegex = /<img[^>]+src=["']([^"']+\.(?:webp|png|jpg|jpeg))["']/i;
  const htmlMatch = markdownContent.match(htmlImageRegex);

  if (htmlMatch && htmlMatch[1]) {
    return htmlMatch[1];
  }

  return null;
}

/**
 * Select the OG image source for an article
 */
export function selectOGImageSource(
  article: CollectionEntry<'articles'>
): OGImageSource {
  const { data, body } = article;

  // Priority 1: Use image_hero from frontmatter
  if (data.image_hero) {
    return {
      type: 'hero',
      path: data.image_hero,
    };
  }

  // Priority 2: Extract first image from article body
  const contentImage = extractFirstImage(body || '');
  if (contentImage) {
    return {
      type: 'content_image',
      path: contentImage,
    };
  }

  // Priority 3: Fall back to gradient-only design
  return {
    type: 'gradient',
  };
}
