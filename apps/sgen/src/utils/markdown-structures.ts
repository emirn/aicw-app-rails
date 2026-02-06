/**
 * Markdown Structure Detection for Patch Validation
 *
 * Detects line-based "protected regions" where content should not be inserted.
 * Used by applyPatches() to prevent breaking tables, lists, and code blocks.
 */

export interface MarkdownRegion {
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
  type: 'table' | 'bullet_list' | 'numbered_list' | 'fenced_code';
}

export interface StructureAnalysis {
  regions: MarkdownRegion[];
  lineCount: number;
}

/**
 * Analyze markdown content and identify all protected regions
 */
export function analyzeMarkdownStructures(content: string): StructureAnalysis {
  const lines = content.split(/\r?\n/);
  const regions: MarkdownRegion[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNum = i + 1; // Convert to 1-based

    // Check for fenced code blocks (``` or ~~~)
    const codeBlockMatch = line.match(/^(\s*)(```|~~~)/);
    if (codeBlockMatch) {
      const indent = codeBlockMatch[1];
      const fence = codeBlockMatch[2];
      const startLine = lineNum;
      let endLine = lineNum;
      i++;
      while (i < lines.length) {
        // Match closing fence with same or less indentation
        const closingMatch = lines[i].match(/^(\s*)(```|~~~)\s*$/);
        if (closingMatch && closingMatch[2] === fence && closingMatch[1].length <= indent.length) {
          endLine = i + 1;
          break;
        }
        i++;
      }
      // If we didn't find closing fence, endLine stays at last checked line
      if (endLine === startLine && i >= lines.length) {
        endLine = lines.length;
      }
      regions.push({ startLine, endLine, type: 'fenced_code' });
      i++;
      continue;
    }

    // Check for tables (lines starting with |)
    if (line.trimStart().startsWith('|')) {
      const startLine = lineNum;
      let endLine = lineNum;
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        endLine = i + 1;
        i++;
      }
      regions.push({ startLine, endLine, type: 'table' });
      continue;
    }

    // Check for bullet lists (-, *, +)
    const bulletMatch = line.match(/^(\s*)([-*+])\s+\S/);
    if (bulletMatch) {
      const startLine = lineNum;
      let endLine = lineNum;
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        // Continue if: another bullet item
        const isBullet = /^\s*[-*+]\s+\S/.test(nextLine);
        // Continue if: indented continuation (content under a list item)
        const isIndentedContent =
          nextLine.length > 0 && /^\s+/.test(nextLine) && nextLine.trim().length > 0;
        // Continue if: blank line followed by another bullet (list continues)
        const isBlankWithinList =
          nextLine.trim() === '' && i + 1 < lines.length && /^\s*[-*+]\s+\S/.test(lines[i + 1]);

        if (isBullet || isIndentedContent || isBlankWithinList) {
          if (nextLine.trim() !== '') {
            endLine = i + 1;
          }
          i++;
        } else {
          break;
        }
      }
      regions.push({ startLine, endLine, type: 'bullet_list' });
      continue;
    }

    // Check for numbered lists (1., 2., etc.)
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s+\S/);
    if (numberedMatch) {
      const startLine = lineNum;
      let endLine = lineNum;
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        // Continue if: another numbered item
        const isNumbered = /^\s*\d+\.\s+\S/.test(nextLine);
        // Continue if: indented continuation
        const isIndentedContent =
          nextLine.length > 0 && /^\s+/.test(nextLine) && nextLine.trim().length > 0;
        // Continue if: blank line followed by another numbered item
        const isBlankWithinList =
          nextLine.trim() === '' && i + 1 < lines.length && /^\s*\d+\.\s+\S/.test(lines[i + 1]);

        if (isNumbered || isIndentedContent || isBlankWithinList) {
          if (nextLine.trim() !== '') {
            endLine = i + 1;
          }
          i++;
        } else {
          break;
        }
      }
      regions.push({ startLine, endLine, type: 'numbered_list' });
      continue;
    }

    i++;
  }

  return { regions, lineCount: lines.length };
}

/**
 * Check if a line number falls within any protected region
 */
export function isLineInProtectedRegion(
  lineNum: number,
  regions: MarkdownRegion[]
): MarkdownRegion | null {
  for (const region of regions) {
    // A line is "inside" if inserting after it would still be within the structure
    // For a region spanning lines 5-10, inserting after line 5, 6, 7, 8, or 9 would break it
    // Inserting after line 10 is OK (inserts after the structure)
    if (lineNum >= region.startLine && lineNum < region.endLine) {
      return region;
    }
  }
  return null;
}

/**
 * Find the safe insertion point for a line that's inside a protected region
 * Returns the line number where content should be inserted (after the region ends)
 *
 * Note: The patch system uses "[line N]" to mean "insert at position N" (before line N).
 * So to insert AFTER a structure ending at line E, we return E+1.
 */
export function findSafeInsertionPoint(
  requestedLine: number,
  regions: MarkdownRegion[],
  totalLines: number
): { line: number; adjusted: boolean; originalRegion?: MarkdownRegion } {
  const region = isLineInProtectedRegion(requestedLine, regions);

  if (!region) {
    return { line: requestedLine, adjusted: false };
  }

  // Insert after the region ends: return endLine + 1 so the patch inserts
  // at the position after the last line of the structure
  const safeLine = Math.min(region.endLine + 1, totalLines + 1);

  return {
    line: safeLine,
    adjusted: true,
    originalRegion: region,
  };
}
