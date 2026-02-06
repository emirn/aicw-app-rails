import { createHash, randomUUID } from 'crypto';
import { IContentPlan, IWebsiteInfo } from '../types';

export const normalizeSlug = (slug: string): string => {
  if (!slug) return '';
  // Normalize to lowercase, ensure leading slash, remove duplicate slashes
  let s = slug.trim().toLowerCase();
  if (!s.startsWith('/')) s = '/' + s;
  s = s.replace(/\/+/, '/');
  // Remove trailing slash except for root
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
};

const randSuffix = (): string => {
  const id = randomUUID();
  const md5 = createHash('md5').update(id).digest('hex');
  return '-' + md5.slice(-6);
};

export const collectKnownSlugs = (
  websiteInfo?: IWebsiteInfo,
  plan?: IContentPlan | { items?: { slug?: string }[] } | string[]
): Set<string> => {
  const set = new Set<string>();
  if (websiteInfo) {
    (websiteInfo.pages_published || []).forEach((p) => {
      if (p?.slug) set.add(normalizeSlug(p.slug));
    });
    (websiteInfo.main_pages || []).forEach((p) => {
      if (p?.slug) set.add(normalizeSlug(p.slug));
    });
  }
  if (Array.isArray(plan)) {
    plan.forEach((s) => s && set.add(normalizeSlug(String(s))));
  } else if (plan && (plan as any).items) {
    ((plan as any).items || []).forEach((it: any) => {
      if (it?.slug) set.add(normalizeSlug(String(it.slug)));
    });
  }
  return set;
};

export const ensureUniqueSlug = (
  slug: string,
  known: Set<string>
): string => {
  if (!slug) return slug;
  let candidate = normalizeSlug(slug);
  while (known.has(candidate)) {
    candidate = candidate + randSuffix();
  }
  known.add(candidate);
  return candidate;
};

