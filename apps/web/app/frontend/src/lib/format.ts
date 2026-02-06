/**
 * Centralized number formatting utilities.
 * All functions strip unnecessary trailing zeros (e.g., 10.0 → "10", 12.50 → "12.5").
 */

export function formatNumber(value: number, maxDecimals: number = 1): string {
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, '');
}

export function formatPercent(value: number, maxDecimals: number = 1): string {
  return `${formatNumber(value, maxDecimals)}%`;
}

export function formatScore(score: number, maxScore: number): string {
  return `${formatNumber(score, 1)}/${maxScore} pts`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${formatNumber(ms / 1000, 1)}s`;
}

export function getPathLabel(path: string | null | undefined): string | undefined {
  if (!path || path === '/') return 'homepage';

  const normalized = path.toLowerCase();
  if (normalized === '/blog' || normalized.startsWith('/blog/')) return 'blog';
  if (normalized === '/about' || normalized.startsWith('/about/')) return 'about';

  return undefined;
}
