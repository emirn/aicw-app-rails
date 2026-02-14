import { IApiArticle } from '../types';
import {
  analyzeMarkdownStructures,
  findSafeInsertionPoint,
  MarkdownRegion,
} from './markdown-structures';

/**
 * Result of mergeUpdate operation
 */
export interface MergeResult {
  article: IApiArticle;
  rejected: boolean;
  reason?: string;
}

/**
 * Details about a patch that was adjusted to avoid breaking markdown structures
 */
export interface PatchAdjustment {
  originalLine: number;
  adjustedLine: number;
  reason: string;
  regionType: string;
}

/**
 * Result of applyPatches when structure validation is enabled
 */
export interface ApplyPatchesResult {
  content: string;
  adjustments: PatchAdjustment[];
}

/**
 * Stopwords to filter from paths for cleaner, shorter URLs.
 * Based on SEO best practices (2025-2026): 3-5 words optimal.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'by', 'for', 'with',
  'at', 'in', 'to', 'on', 'as', 'is', 'it', 'how', 'what', 'why', 'when',
  'where', 'which', 'who', 'your', 'my', 'our', 'their', 'this', 'that'
]);

/**
 * Generate a clean, SEO-friendly path from a title.
 * - Removes stopwords for shorter URLs
 * - Limits to maxWords (default 5) for optimal SEO
 * - Uses hyphens between words
 *
 * Examples:
 *   "How to Detect Article Created by AI" → "detect-article-created-ai"
 *   "The Best AI Tools for Content Creation" → "best-ai-tools-content-creation"
 */
export const generatePathFromTitle = (title: string, maxWords: number = 5): string => {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const words = normalized.split(/\s+/)
    .filter(word => word.length >= 2 && !STOPWORDS.has(word))
    .slice(0, maxWords);
  return words.join('-') || 'article';
};

export const extractContentText = (c: any, raw: string): string => {
  // If c is already an object with content, extract it
  if (typeof c === 'object' && c?.content) {
    return String(c.content);
  }

  // If c is a string, it might be stringified JSON - try to parse it
  if (typeof c === 'string') {
    // Strip markdown code fences first
    let cleaned = c.trim();
    if (cleaned.startsWith('```')) {
      // Remove ```json or ``` prefix
      const firstNewline = cleaned.indexOf('\n');
      const lastBackticks = cleaned.lastIndexOf('```');
      if (firstNewline !== -1 && lastBackticks > firstNewline) {
        cleaned = cleaned.substring(firstNewline + 1, lastBackticks).trim();
      }
    }

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object' && parsed.content) {
        return String(parsed.content);
      }
    } catch (e) {
      // Not JSON, return the cleaned string
      return cleaned;
    }

    return c;
  }

  return raw;
};

export const mergeUpdate = (base: IApiArticle, mode: string, content: any, rawContent: string): MergeResult => {
  if (mode === 'create_meta' && typeof content === 'object' && content) {
    const merged: IApiArticle = {
      ...base,
      path: content.path || base.path,
      title: content.title || base.title,
      description: content.description || base.description,
      keywords: content.keywords || base.keywords,
    } as IApiArticle;
    if (!merged.path && merged.title) merged.path = generatePathFromTitle(merged.title);
    return { article: merged, rejected: false };
  }
  if (typeof content === 'object' && content?.content) {
    const text = String(content.content);
    return { article: { ...base, content: text }, rejected: false };
  }
  if (typeof content === 'object' && content?.id) {
    return {
      article: { ...base, ...content } as IApiArticle,
      rejected: false
    };
  }
  const contentText = extractContentText(content, rawContent);

  // SAFETY: Never replace article content with raw JSON responses
  // This prevents data destruction when AI returns malformed JSON that gets passed through
  if (contentText.includes('"replacements"') ||
      (contentText.startsWith('{') && contentText.includes('"')) ||
      contentText.startsWith('```json')) {
    console.error('mergeUpdate: Refusing to replace article with JSON-like response, preserving original');
    return {
      article: base,
      rejected: true,
      reason: 'AI returned JSON-like response instead of content'
    };
  }

  // SAFETY: Refuse to replace if content shrinks by more than 50%
  // This prevents data loss when AI returns partial/malformed content
  if (base.content && contentText.length < base.content.length * 0.5) {
    console.error(`mergeUpdate: Content shrunk by >50% (${base.content.length} -> ${contentText.length}), preserving original`);
    return {
      article: base,
      rejected: true,
      reason: `Content shrunk by >50% (${base.content.length} -> ${contentText.length} chars)`
    };
  }

  return { article: { ...base, content: contentText }, rejected: false };
};

export function parseLinePatches(text: string): { line: number; content: string }[] {
  const lines = (text || '').split(/\r?\n/);
  const patches: { line: number; content: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^\[line\s+(\d+)\]\s*$/i);
    if (m) {
      const lineNum = parseInt(m[1], 10);
      const start = i + 1;
      let j = start;
      while (j < lines.length && !/^\[line\s+\d+\]\s*$/i.test(lines[j])) j++;
      const blockContent = lines.slice(start, j).join('\n');
      if (!Number.isNaN(lineNum) && blockContent.trim().length > 0) {
        patches.push({ line: lineNum, content: blockContent });
      }
      i = j;
    } else {
      i++;
    }
  }
  patches.sort((a, b) => b.line - a.line);
  return patches;
}

/**
 * Options for applyPatches function
 */
export interface ApplyPatchesOptions {
  /** Enable markdown structure validation (default: true) */
  validateStructures?: boolean;
  /** Logger function for warnings about adjustments */
  logger?: (msg: string) => void;
}

/**
 * Apply patches with optional markdown structure validation.
 *
 * When validateStructures is enabled (default), patches that would insert
 * content inside tables, lists, or code blocks are automatically adjusted
 * to insert after the structure ends instead.
 *
 * @param baseContent - Original article content
 * @param patches - Array of patches with line numbers and content (should be sorted descending)
 * @param options - Configuration options
 * @returns Patched content string, or ApplyPatchesResult if adjustments were made
 */
export function applyPatches(
  baseContent: string,
  patches: { line: number; content: string }[],
  options: ApplyPatchesOptions = {}
): string | ApplyPatchesResult {
  const { validateStructures = true, logger } = options;
  const baseLines = (baseContent || '').split(/\r?\n/);
  const adjustments: PatchAdjustment[] = [];

  // Analyze markdown structures if validation enabled
  let analysis: ReturnType<typeof analyzeMarkdownStructures> | null = null;
  if (validateStructures && baseContent) {
    analysis = analyzeMarkdownStructures(baseContent);
  }

  // Process patches (should already be sorted descending by parseLinePatches)
  for (const p of patches) {
    let targetLine = p.line;

    // Validate and adjust if needed
    if (analysis) {
      const { line: safeLine, adjusted, originalRegion } = findSafeInsertionPoint(
        p.line,
        analysis.regions,
        baseLines.length
      );

      if (adjusted && originalRegion) {
        const adjustment: PatchAdjustment = {
          originalLine: p.line,
          adjustedLine: safeLine,
          reason: `Line ${p.line} is inside a ${originalRegion.type} (lines ${originalRegion.startLine}-${originalRegion.endLine})`,
          regionType: originalRegion.type,
        };
        adjustments.push(adjustment);

        if (logger) {
          logger(
            `[applyPatches] Adjusted insertion: ${adjustment.reason}. Moving to line ${safeLine}`
          );
        }

        targetLine = safeLine;
      }
    }

    const idx = Math.min(Math.max(targetLine - 1, 0), baseLines.length);
    const insertLines = (p.content || '').split(/\r?\n/);
    baseLines.splice(idx, 0, ...insertLines);
  }

  const content = baseLines.join('\n');

  // Return extended result if we have adjustments
  if (adjustments.length > 0) {
    return { content, adjustments };
  }

  return content;
}

// ============================================================================
// Text Replace Mode - for surgical text modifications (e.g., adding links)
// ============================================================================

export interface TextReplacement {
  find: string;
  replace: string;
}

/**
 * Parse text replacements from AI response
 * Expected format: { "replacements": [{ "find": "...", "replace": "..." }] }
 */
export function parseTextReplacements(content: any): TextReplacement[] {
  if (typeof content === 'object' && Array.isArray(content.replacements)) {
    return content.replacements.filter(
      (r: any) => typeof r.find === 'string' && typeof r.replace === 'string' &&
                  r.find.trim().length > 0
    );
  }
  return [];
}

/**
 * Escape special regex characters
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply text replacements to content
 * - Sorts by length (longest first) to prevent partial matches
 * - Replaces FIRST occurrence only (prevents duplicate links)
 * - Normalizes whitespace for matching
 */
export function applyTextReplacements(
  content: string,
  replacements: TextReplacement[]
): { result: string; applied: number; skipped: string[] } {
  // Sort longest first to prevent partial replacement issues
  const sorted = [...replacements].sort(
    (a, b) => b.find.length - a.find.length
  );

  let result = content;
  let applied = 0;
  const skipped: string[] = [];

  for (const { find, replace } of sorted) {
    // Build regex that matches normalized whitespace
    const pattern = escapeRegExp(find).replace(/\\s\+/g, '\\s+').replace(/\s+/g, '\\s+');
    const regex = new RegExp(pattern);  // No 'g' flag = first match only

    if (regex.test(result)) {
      result = result.replace(regex, replace);
      applied++;
    } else {
      // Track skipped replacements for debugging
      skipped.push(find.substring(0, 50) + (find.length > 50 ? '...' : ''));
    }
  }

  return { result, applied, skipped };
}

// ============================================================================
// Citation Pattern Fix - for OpenAI search models
// ============================================================================

/**
 * Fix OpenAI search model citation pattern.
 *
 * OpenAI's gpt-4o-*-search-preview models have built-in citation formatting
 * that appends citations like: "text. ([domain](url))"
 *
 * This function converts that pattern to inline links:
 *   "comprehensive search results. ([brave.com](url))"
 *   -> "[comprehensive search results](url)."
 *
 * @param text - Text that may contain citation patterns
 * @returns Text with citations converted to inline links
 */
export function fixCitationPattern(text: string): string {
  // Pattern matches: "word(s). ([domain](url))" or "word(s): ([domain](url))"
  // Captures: (1-10 words before punctuation), (punctuation), and (the full URL)
  const pattern = /(\S+(?:\s+\S+){0,9})([.:])\s*\(\[[\w.-]+\]\((https?:\/\/[^\)]+)\)\)/g;

  return text.replace(pattern, (match, phrase, punctuation, url) => {
    // Clean the phrase - remove any trailing punctuation
    const cleanPhrase = phrase.replace(/[.,;:!?]$/, '').trim();
    return `[${cleanPhrase}](${url})${punctuation}`;
  });
}

// ============================================================================
// URL Deduplication - for enforcing "use each link only once"
// ============================================================================

/**
 * Extract URLs from markdown link syntax [text](url)
 */
function extractUrlsFromMarkdown(text: string): string[] {
  const urlPattern = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  const urls: string[] = [];
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    urls.push(match[2]);
  }
  return urls;
}

/**
 * Deduplicate replacements by URL - keep only first occurrence of each URL.
 * Enforces "use each link only once" at code level since AI models
 * don't always follow this instruction reliably.
 */
export function deduplicateReplacementsByUrl(
  replacements: TextReplacement[]
): { deduplicated: TextReplacement[]; removed: string[] } {
  const seenUrls = new Set<string>();
  const deduplicated: TextReplacement[] = [];
  const removed: string[] = [];

  for (const r of replacements) {
    const urls = extractUrlsFromMarkdown(r.replace);
    const hasSeenUrl = urls.some(url => seenUrls.has(url));

    if (hasSeenUrl) {
      const duplicateUrl = urls.find(url => seenUrls.has(url));
      removed.push(`Duplicate URL "${duplicateUrl}" for text "${r.find.substring(0, 40)}..."`);
    } else {
      urls.forEach(url => seenUrls.add(url));
      deduplicated.push(r);
    }
  }

  return { deduplicated, removed };
}

