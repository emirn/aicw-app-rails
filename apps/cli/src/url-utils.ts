/**
 * Normalize URL to ensure it has a protocol prefix (https://)
 */
export function normalizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;

  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  // Already has protocol
  if (trimmed.match(/^https?:\/\//i)) {
    return trimmed;
  }

  // Add https:// by default
  return `https://${trimmed}`;
}

/**
 * Extract hostname from URL for use as directory prefix
 */
export function hostPrefixFromUrl(url: string): string {
  try {
    const normalized = normalizeUrl(url);
    const u = new URL(normalized);
    const host = (u.hostname || 'site').toLowerCase();
    return host;
  } catch {
    return 'site';
  }
}
