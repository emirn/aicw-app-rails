/**
 * Content excluder — strips sections from content before sending to AI,
 * and provides region-based guards for link insertion.
 *
 * Uses depth-counting for nested <div> tags to find the correct outermost
 * closing tag when the start marker is a <div>.
 */

export interface ExcludeContentRule {
  start: string;
  end: string;
}

export interface ExcludedRegion {
  startIndex: number;
  endIndex: number;
}

/**
 * Find all excluded regions in content based on rules.
 * For rules where start begins with "<div", uses div-depth counting
 * to match the correct outermost closing </div>.
 */
export function findExcludedRegions(
  content: string,
  rules: ExcludeContentRule[]
): ExcludedRegion[] {
  const regions: ExcludedRegion[] = [];

  for (const rule of rules) {
    let searchFrom = 0;
    while (searchFrom < content.length) {
      const startIdx = content.indexOf(rule.start, searchFrom);
      if (startIdx === -1) break;

      let endIdx: number;

      if (rule.start.startsWith('<div') && rule.end === '</div>') {
        // Depth-counting: find matching outermost </div>
        endIdx = findMatchingDivClose(content, startIdx + rule.start.length);
      } else {
        const endSearch = content.indexOf(rule.end, startIdx + rule.start.length);
        endIdx = endSearch === -1 ? -1 : endSearch + rule.end.length;
      }

      if (endIdx === -1) {
        // No closing tag found — exclude from start to end of content
        regions.push({ startIndex: startIdx, endIndex: content.length });
        break;
      }

      regions.push({ startIndex: startIdx, endIndex: endIdx });
      searchFrom = endIdx;
    }
  }

  // Sort by startIndex for consistent processing
  regions.sort((a, b) => a.startIndex - b.startIndex);
  return regions;
}

/**
 * Find the matching </div> for an opening <div>, tracking nested divs.
 * @param content - Full content string
 * @param afterOpen - Position right after the opening <div...> tag
 * @returns Position after the matching </div>, or -1 if not found
 */
function findMatchingDivClose(content: string, afterOpen: number): number {
  let depth = 1;
  let pos = afterOpen;

  while (pos < content.length && depth > 0) {
    const nextOpen = content.indexOf('<div', pos);
    const nextClose = content.indexOf('</div>', pos);

    if (nextClose === -1) return -1; // No closing tag at all

    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Found a nested <div before the next </div>
      depth++;
      pos = nextOpen + 4; // skip past "<div"
    } else {
      // Found </div>
      depth--;
      if (depth === 0) {
        return nextClose + '</div>'.length;
      }
      pos = nextClose + '</div>'.length;
    }
  }

  return -1;
}

/**
 * Strip excluded content from text, returning cleaned version.
 * Regions are removed in reverse order to preserve indices.
 */
export function stripExcludedContent(
  content: string,
  rules: ExcludeContentRule[]
): string {
  if (!rules || rules.length === 0) return content;

  const regions = findExcludedRegions(content, rules);
  if (regions.length === 0) return content;

  // Remove in reverse order to preserve earlier indices
  let result = content;
  for (let i = regions.length - 1; i >= 0; i--) {
    const { startIndex, endIndex } = regions[i];
    result = result.substring(0, startIndex) + result.substring(endIndex);
  }

  return result;
}

/**
 * Check if a character position falls inside any excluded region.
 */
export function isPositionExcluded(
  position: number,
  regions: ExcludedRegion[]
): boolean {
  return regions.some(r => position >= r.startIndex && position < r.endIndex);
}
