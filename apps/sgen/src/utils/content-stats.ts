/**
 * Content stats utility
 *
 * Counts structural elements in markdown content for before/after comparison.
 */

export interface ContentStatsSnapshot {
  words: number;
}

export interface ContentStats {
  words_before: number;
  words_after: number;
  words_delta: number;
  words_delta_pct: number;
  changes: number;
}

export function countContentStats(content: string): ContentStatsSnapshot {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  return { words };
}

export function buildContentStats(before: ContentStatsSnapshot, after: ContentStatsSnapshot): ContentStats {
  const wordsDelta = after.words - before.words;
  const wordsDeltaPct = before.words > 0 ? Math.round((wordsDelta / before.words) * 100) : 0;
  return {
    words_before: before.words,
    words_after: after.words,
    words_delta: wordsDelta,
    words_delta_pct: wordsDeltaPct,
    changes: 0,
  };
}
