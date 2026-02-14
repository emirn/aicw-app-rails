import { createHash, randomUUID } from 'crypto';
import { IContentPlan, IWebsiteInfo } from '../types';

export const normalizePath = (path: string): string => {
  if (!path) return '';
  // Normalize to lowercase, ensure leading slash, remove duplicate slashes
  let s = path.trim().toLowerCase();
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

export const collectKnownPaths = (
  websiteInfo?: IWebsiteInfo,
  plan?: IContentPlan | { items?: { path?: string }[] } | string[]
): Set<string> => {
  const set = new Set<string>();
  if (websiteInfo) {
    (websiteInfo.pages_published || []).forEach((p) => {
      if (p?.path) set.add(normalizePath(p.path));
    });
    (websiteInfo.main_pages || []).forEach((p) => {
      if (p?.path) set.add(normalizePath(p.path));
    });
  }
  if (Array.isArray(plan)) {
    plan.forEach((s) => s && set.add(normalizePath(String(s))));
  } else if (plan && (plan as any).items) {
    ((plan as any).items || []).forEach((it: any) => {
      if (it?.path) set.add(normalizePath(String(it.path)));
    });
  }
  return set;
};

export const ensureUniquePath = (
  path: string,
  known: Set<string>
): string => {
  if (!path) return path;
  let candidate = normalizePath(path);
  while (known.has(candidate)) {
    candidate = candidate + randSuffix();
  }
  known.add(candidate);
  return candidate;
};
