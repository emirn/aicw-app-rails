/**
 * Simple Content Plan Parser
 *
 * Parses plain text content plans with the format:
 * TITLE: Article Title
 * URL: relative/path
 * DATE: 2026-05-01 (optional)
 * KEYWORDS: keyword1, keyword2 (optional)
 * DESCRIPTION: Brief description...
 * ---
 *
 * NO AI - works entirely locally
 * Skips invalid blocks with warnings
 */

import { ContentPlan, ContentPlanItem } from '@blogpostgen/types';

/**
 * Result of parsing a content plan
 */
export interface SimplePlanParseResult {
  plan: ContentPlan;
  parsed: number;
  skipped: number;
  warnings: Array<{ blockIndex: number; reason: string; rawBlock: string }>;
  sourceFile?: string;
}

/**
 * Parse simple text format into ContentPlan with detailed results
 * @param content - Plain text content plan
 * @param sourceFile - Optional path to source file (for summary output)
 * @returns Parse result with plan, counts, and warnings
 */
export function simplePlanToPlan(
  content: string,
  sourceFile?: string
): SimplePlanParseResult {
  // Split by --- (with flexible whitespace handling, support 3+ dashes)
  const blocks = content.split(/\n-{3,}\n/).filter((b) => b.trim());

  const items: ContentPlanItem[] = [];
  const warnings: Array<{ blockIndex: number; reason: string; rawBlock: string }> = [];
  let skipped = 0;

  for (let i = 0; i < blocks.length; i++) {
    const result = parseSimpleArticle(blocks[i], i);

    if (result.item) {
      items.push(result.item);
    } else {
      skipped++;
      warnings.push({ blockIndex: i + 1, reason: result.reason!, rawBlock: blocks[i] });
    }
  }

  return {
    plan: {
      website: { url: '', title: '' }, // Project info comes from _project.yaml
      total_articles: items.length,
      items,
    },
    parsed: items.length,
    skipped,
    warnings,
    sourceFile,
  };
}

/**
 * Result of parsing a single article block
 */
interface ParseArticleResult {
  item: ContentPlanItem | null;
  reason?: string;
}

/**
 * Parse a single article block
 * @param block - Text block for one article
 * @param index - Article index (for ID generation)
 * @returns Parse result with item or error reason
 */
function parseSimpleArticle(block: string, index: number): ParseArticleResult {
  const title = extractField(block, 'TITLE');
  const url = extractField(block, 'URL');
  const description = extractDescription(block);
  const date = extractField(block, 'DATE');
  const keywords = extractField(block, 'KEYWORDS');
  const typeField = extractField(block, 'TYPE');

  // Validate required fields
  const missing: string[] = [];
  if (!title) missing.push('TITLE');
  if (!url) missing.push('URL');
  if (!description) missing.push('DESCRIPTION');

  if (missing.length > 0) {
    return {
      item: null,
      reason: `Missing ${missing.join(', ')}`,
    };
  }

  // Validate DATE format if provided
  if (date && !isValidDate(date)) {
    return {
      item: null,
      reason: `Invalid DATE format (expected YYYY-MM-DD, got: ${date})`,
    };
  }

  // Parse item_type from TYPE field
  const itemType = typeField?.toLowerCase() === 'page' ? 'page' as const : 'article' as const;

  return {
    item: {
      id: `plan-${index + 1}`,
      slug: url!.trim().replace(/^\//, ''), // Remove leading slash if present
      title: title!.trim(),
      description: description!.trim(),
      target_keywords: keywords
        ? keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [],
      target_words: 2000, // Default
      search_intent: 'informational', // Default
      funnel_stage: 'top', // Default
      priority: 2, // Default (medium)
      date: date?.trim(),
      item_type: itemType,
    },
  };
}

/**
 * Extract a single-line field value (case-insensitive)
 * @param block - Text block to search
 * @param fieldName - Field name (e.g., "TITLE")
 * @returns Field value or undefined
 */
function extractField(block: string, fieldName: string): string | undefined {
  const regex = new RegExp(`^${fieldName}:\\s*(.+)$`, 'im');
  const match = block.match(regex);
  return match?.[1]?.trim();
}

/**
 * Extract DESCRIPTION content (everything after "DESCRIPTION:" to end of block)
 * DESCRIPTION is always the last field in an article block.
 * @param block - Text block to search
 * @returns Description content or empty string
 */
function extractDescription(block: string): string {
  // Find the position of DESCRIPTION: (case-insensitive)
  const descIndex = block.toLowerCase().indexOf('description:');
  if (descIndex === -1) return '';

  // Get everything after "DESCRIPTION:"
  const afterDesc = block.slice(descIndex + 'description:'.length);
  return afterDesc.trim();
}

/**
 * Convert a ContentPlan back into the simple text format.
 * Inverse of simplePlanToPlan() — useful for displaying AI-generated plans.
 *
 * @param plan - ContentPlan to format
 * @returns Plain text in TITLE/URL/KEYWORDS/DESCRIPTION format
 */
export function planToSimpleText(plan: ContentPlan): string {
  return plan.items.map((item) => {
    const lines: string[] = [];
    lines.push(`TITLE: ${item.title}`);
    lines.push(`URL: ${item.slug}`);
    if (item.item_type === 'page') {
      lines.push(`TYPE: page`);
    }
    if (item.target_keywords?.length) {
      lines.push(`KEYWORDS: ${item.target_keywords.join(', ')}`);
    }
    lines.push(`DESCRIPTION: ${item.description}`);
    return lines.join('\n');
  }).join('\n---\n');
}

/**
 * Validate date format (YYYY-MM-DD)
 * @param dateStr - Date string to validate
 * @returns True if valid format
 */
function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}
