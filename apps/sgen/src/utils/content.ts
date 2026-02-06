/**
 * Content utilities for article processing
 */

/**
 * Normalize text for comparison: lowercase, remove punctuation, trim whitespace
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')    // normalize whitespace
    .trim();
}

/**
 * Strip duplicate H1 title from content if it matches the article title.
 *
 * AI models sometimes include the title as an H1 heading at the start of content,
 * even when instructed not to. This creates duplicate titles since the title is
 * also stored separately in metadata.
 *
 * This function checks if the content starts with an H1 that matches the title
 * (using normalized comparison) and removes it if so.
 *
 * @param content - The article content (markdown)
 * @param title - The article title from metadata
 * @returns The content with duplicate H1 title removed (if found)
 */
export function stripDuplicateTitleH1(content: string, title: string): string {
  if (!content || !title) return content;

  // Check if content starts with H1 heading
  const h1Match = content.match(/^#\s+(.+?)[\s]*\n/);
  if (!h1Match) return content;

  const h1Text = h1Match[1].trim();
  const normalizedH1 = normalizeForComparison(h1Text);
  const normalizedTitle = normalizeForComparison(title);

  // Only remove if H1 matches title (normalized comparison)
  if (normalizedH1 === normalizedTitle) {
    // Remove the H1 line and any trailing blank lines
    return content.replace(/^#\s+.+\n+/, '');
  }

  return content;
}
