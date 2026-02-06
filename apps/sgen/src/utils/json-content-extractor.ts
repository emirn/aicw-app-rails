/**
 * Multi-strategy JSON content extraction
 *
 * Tries various approaches to extract markdown content from AI responses.
 * Used by both generate.ts and enhance.ts handlers.
 */

export interface ExtractionResult {
  success: boolean;
  content: string;          // Extracted markdown (or raw input if failed)
  metadata?: {
    title?: string;
    description?: string;
    keywords?: string[];
    slug?: string;
  };
  strategy?: string;        // Which strategy succeeded
  rawJson?: string;         // Original JSON string (for index_failed.md)
}

interface Logger {
  info: Function;
  warn: Function;
}

/**
 * Try multiple strategies to extract markdown content from AI response
 */
export function extractMarkdownContent(
  input: string | object,
  rawContent: string,
  log: Logger
): ExtractionResult {
  // Strategy 1: If already object with .content field
  if (typeof input === 'object' && input !== null) {
    if ('content' in input && typeof (input as any).content === 'string') {
      log.info({ strategy: 'object_content_field' }, 'extract:success');
      return buildSuccess((input as any).content, input, 'object_content_field');
    }
  }

  // For string input, try multiple parsing strategies
  const stringInput = typeof input === 'string' ? input : rawContent;

  // Strategy 2: Strip ```json wrapper and parse
  const stripped = stripCodeFence(stringInput);
  if (stripped !== stringInput) {
    const parsed = tryParse(stripped, log);
    if (parsed?.content) {
      log.info({ strategy: 'strip_code_fence' }, 'extract:success');
      return buildSuccess(parsed.content, parsed, 'strip_code_fence');
    }
  }

  // Strategy 3: Direct JSON.parse
  const directParsed = tryParse(stringInput, log);
  if (directParsed?.content) {
    log.info({ strategy: 'direct_parse' }, 'extract:success');
    return buildSuccess(directParsed.content, directParsed, 'direct_parse');
  }

  // Strategy 4: Sanitize control characters and parse
  const sanitized = sanitizeJsonString(stringInput);
  const sanitizedParsed = tryParse(sanitized, log);
  if (sanitizedParsed?.content) {
    log.info({ strategy: 'sanitized_parse' }, 'extract:success');
    return buildSuccess(sanitizedParsed.content, sanitizedParsed, 'sanitized_parse');
  }

  // Strategy 5: Find first balanced {} and parse
  const balanced = extractBalancedBraces(stringInput);
  if (balanced) {
    const balancedParsed = tryParse(balanced, log);
    if (balancedParsed?.content) {
      log.info({ strategy: 'balanced_braces' }, 'extract:success');
      return buildSuccess(balancedParsed.content, balancedParsed, 'balanced_braces');
    }
  }

  // Strategy 6: Check if it looks like markdown already (no JSON)
  if (looksLikeMarkdown(stringInput)) {
    log.info({ strategy: 'already_markdown' }, 'extract:success');
    return { success: true, content: stringInput, strategy: 'already_markdown' };
  }

  // Strategy 7: Regex extraction of content field (fallback for malformed JSON)
  // This handles cases where JSON.parse fails but the content field is still extractable
  const contentMatch = stringInput.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (contentMatch && contentMatch[1]) {
    // Unescape the JSON string content
    const rawContent = contentMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    log.info({ strategy: 'regex_content_field', contentLength: rawContent.length }, 'extract:success');
    return { success: true, content: rawContent, strategy: 'regex_content_field' };
  }

  // All strategies failed - return failure
  log.warn({ inputPreview: stringInput.substring(0, 200) }, 'extract:all_strategies_failed');
  return {
    success: false,
    content: stringInput,  // Return as-is
    rawJson: stringInput,  // Save for index_failed.md
  };
}

/**
 * Build success result with metadata extraction
 */
function buildSuccess(content: string, parsed: any, strategy: string): ExtractionResult {
  const metadata: ExtractionResult['metadata'] = {};
  if (parsed.title) metadata.title = parsed.title;
  if (parsed.description) metadata.description = parsed.description;
  if (parsed.slug) metadata.slug = parsed.slug;
  if (parsed.keywords) {
    metadata.keywords = typeof parsed.keywords === 'string'
      ? parsed.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0)
      : parsed.keywords;
  }

  return {
    success: true,
    content,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    strategy,
  };
}

/**
 * Strip ```json or ``` code fence wrapper
 */
function stripCodeFence(str: string): string {
  // Normalize CRLF to LF first (Windows line endings can break regex matching)
  const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalized.trim();
  if (trimmed.startsWith('```json')) {
    return trimmed.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```\w*\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return normalized;  // Return normalized version even if no fence found
}

/**
 * Try JSON.parse with optional error logging
 */
function tryParse(str: string, log?: Logger): any | null {
  try {
    return JSON.parse(str);
  } catch (e: any) {
    if (log) {
      // Log the actual parse error for debugging
      const posMatch = e.message?.match(/position (\d+)/);
      log.warn({
        error: e.message,
        position: posMatch?.[1],
        nearPosition: posMatch?.[1] ? str.substring(Number(posMatch[1]) - 20, Number(posMatch[1]) + 20) : undefined,
      }, 'json:parse_failed');
    }
    return null;
  }
}

/**
 * Sanitize control characters in JSON string values
 */
function sanitizeJsonString(str: string): string {
  return str.replace(/"([^"\\]|\\.)*"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x1f]/g, (c) => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
  });
}

/**
 * Extract first balanced {} from string
 */
function extractBalancedBraces(str: string): string | null {
  const start = str.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Check if content looks like markdown (not JSON)
 */
function looksLikeMarkdown(str: string): boolean {
  const trimmed = str.trim();
  // Markdown typically starts with # heading, doesn't start with { or [
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
  if (trimmed.startsWith('#')) return true;
  // Has markdown headers somewhere
  if (/^##?\s+/m.test(trimmed)) return true;
  return false;
}

/**
 * Check if existing content needs normalization (for enhance)
 */
export function needsNormalization(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('```json') ||
         (trimmed.startsWith('{') && trimmed.endsWith('}'));
}
