/**
 * Local TOC Generator - No AI Required
 *
 * Generates Table of Contents by parsing markdown headers locally.
 * Zero cost, <10ms latency, 100% deterministic.
 */

// ============================================================================
// Types
// ============================================================================

interface TOCHeading {
  level: 2 | 3;
  text: string;       // Raw heading text (with markdown)
  plainText: string;  // Stripped text for display
  slug: string;       // URL-safe anchor
  line: string;       // Full line for replacement matching
  lineNumber: number; // For debugging
}

interface TOCResult {
  anchorReplacements: Array<{ find: string; replace: string }>;  // Always populated
  tocHtml: string;            // TOC HTML content (wrapped in <div id="toc">)
  headings: TOCHeading[];
  skipped: boolean;
}

interface CodeBlockRange {
  start: number;
  end: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Strip markdown formatting from text (for display and slug generation)
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')    // Bold **text**
    .replace(/\*(.+?)\*/g, '$1')        // Italic *text*
    .replace(/__(.+?)__/g, '$1')        // Bold __text__
    .replace(/_(.+?)_/g, '$1')          // Italic _text_
    .replace(/`(.+?)`/g, '$1')          // Inline code `text`
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Links [text](url)
    .replace(/~~(.+?)~~/g, '$1')        // Strikethrough ~~text~~
    .trim();
}

/**
 * Generate URL-safe slug from heading text
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
}

/**
 * Generate unique slug, appending -2, -3, etc. for duplicates
 */
function generateUniqueSlug(text: string, seen: Map<string, number>): string {
  const plainText = stripMarkdown(text);
  const baseSlug = generateSlug(plainText);

  if (!baseSlug) {
    // Fallback for empty slugs
    const count = seen.get('heading') || 0;
    seen.set('heading', count + 1);
    return count === 0 ? 'heading' : `heading-${count + 1}`;
  }

  const count = seen.get(baseSlug) || 0;
  seen.set(baseSlug, count + 1);

  return count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
}

/**
 * Find all code block ranges in content (to skip headings inside them)
 */
export function getCodeBlockRanges(content: string): CodeBlockRange[] {
  const ranges: CodeBlockRange[] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return ranges;
}

/**
 * Check if a character index is inside any code block
 */
function isInsideCodeBlock(index: number, ranges: CodeBlockRange[]): boolean {
  return ranges.some(r => index >= r.start && index < r.end);
}

/**
 * Check if content already has a TOC
 */
export function hasExistingTOC(content: string): boolean {
  if (/^##\s+Table of Contents/mi.test(content)) return true;
  if (/<div\s+id="toc">/i.test(content)) return true;
  return false;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate TOC locally without AI
 *
 * @param content - Markdown article content
 * @returns TOCResult with anchorReplacements compatible with applyTextReplacements()
 */
export function generateTOCLocal(content: string): TOCResult {
  // 1. Check for existing TOC - skip if already present
  if (hasExistingTOC(content)) {
    return {
      anchorReplacements: [],
      headings: [],
      tocHtml: '',
      skipped: true
    };
  }

  // 2. Get code block ranges to skip headings inside them
  const codeBlocks = getCodeBlockRanges(content);

  // 3. Parse all headings (single pass)
  const lines = content.split('\n');
  const headings: TOCHeading[] = [];
  const seenSlugs = new Map<string, number>();
  let charIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,3})\s+(.+)$/);

    if (match && !isInsideCodeBlock(charIndex, codeBlocks)) {
      const level = match[1].length;
      const text = match[2];

      // Only collect H2/H3 headings for TOC
      if (level === 2 || level === 3) {
        const plainText = stripMarkdown(text);
        headings.push({
          level: level as 2 | 3,
          text,
          plainText,
          slug: generateUniqueSlug(text, seenSlugs),
          line,
          lineNumber: i + 1
        });
      }
    }

    charIndex += line.length + 1; // +1 for newline
  }

  // 4. No headings found - nothing to do
  if (headings.length === 0) {
    return {
      anchorReplacements: [],
      headings: [],
      tocHtml: '',
      skipped: false
    };
  }

  // 5. Build TOC HTML (always generated)
  let tocHtml = '';
  if (headings.length > 0) {
    const items = headings.map(h => {
      const cls = h.level === 3 ? ' class="toc-h3"' : '';
      return `<li${cls}><a href="#${h.slug}">${h.plainText}</a></li>`;
    }).join('\n');
    tocHtml = `<div id="toc">\n<ul>\n${items}\n</ul>\n</div>`;
  }

  // 6. Build anchor replacements — per-anchor existence check to prevent duplicates
  const anchorReplacements: Array<{ find: string; replace: string }> = [];

  for (const h of headings) {
    // Skip if this specific anchor already exists in content
    if (content.includes(`<a id="${h.slug}"></a>`)) {
      continue;
    }
    anchorReplacements.push({
      find: h.line,
      replace: `<a id="${h.slug}"></a>\n\n${h.line}`
    });
  }

  return {
    anchorReplacements,
    headings,
    tocHtml,
    skipped: false
  };
}
