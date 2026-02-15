/**
 * Content stats utility
 *
 * Counts structural elements in markdown content for before/after comparison.
 */

export interface ContentStatsSnapshot {
  words: number;
  headings: number;
  links: number;
  checklists: number;
}

export interface ContentStats {
  words_before: number;
  words_after: number;
  word_delta: number;
  word_delta_pct: number;
  headings_before: number;
  headings_after: number;
  links_before: number;
  links_after: number;
  checklists_before: number;
  checklists_after: number;
}

export function countContentStats(content: string): ContentStatsSnapshot {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const headings = (content.match(/^#{1,6}\s/gm) || []).length;
  const links = (content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length;
  const checklists = (content.match(/^- \[[ x]\]/gm) || []).length;
  return { words, headings, links, checklists };
}

export function buildContentStats(before: ContentStatsSnapshot, after: ContentStatsSnapshot): ContentStats {
  const wordDelta = after.words - before.words;
  const wordDeltaPct = before.words > 0 ? Math.round((wordDelta / before.words) * 100) : 0;
  return {
    words_before: before.words,
    words_after: after.words,
    word_delta: wordDelta,
    word_delta_pct: wordDeltaPct,
    headings_before: before.headings,
    headings_after: after.headings,
    links_before: before.links,
    links_after: after.links,
    checklists_before: before.checklists,
    checklists_after: after.checklists,
  };
}
