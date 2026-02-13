import type { SiteConfig, SectionConfig } from './config';
import { getPublishedArticles } from './articles';

export function isExternalUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

/** Extract subfolder from slug (e.g., "blog/foo" → "blog", "foo" → null) */
export function getSectionFromSlug(slug: string): string | null {
  const parts = slug.split('/');
  return parts.length > 1 ? parts[0] : null;
}

export function getSections(config?: SiteConfig): SectionConfig[] {
  return config?.sections || [];
}

/** Returns sections where path is NOT an external URL (used for page generation) */
export function getLocalSections(config?: SiteConfig): SectionConfig[] {
  return getSections(config).filter((s) => !isExternalUrl(s.path));
}

export function getSectionByPath(path: string, config?: SiteConfig): SectionConfig | undefined {
  return getSections(config).find((s) => s.path === path);
}

/** Filter published articles by subfolder prefix */
export async function getArticlesBySection(sectionId: string) {
  const articles = await getPublishedArticles();
  return articles.filter((a) => getSectionFromSlug(a.slug) === sectionId);
}

/** Title-case a hyphenated id: "legal-ai-tools" → "Legal Ai Tools" */
function titleCase(id: string): string {
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Scan published articles for subfolder prefixes, create default SectionConfig
 * for any not already in config, and merge with explicit sections (config wins).
 */
export async function discoverAllSections(config?: SiteConfig): Promise<SectionConfig[]> {
  const configured = getSections(config);
  const configuredIds = new Set(configured.map((s) => s.id));

  const articles = await getPublishedArticles();
  const discoveredIds = new Set<string>();
  for (const article of articles) {
    const sectionId = getSectionFromSlug(article.slug);
    if (sectionId && !configuredIds.has(sectionId)) {
      discoveredIds.add(sectionId);
    }
  }

  const autoSections: SectionConfig[] = [...discoveredIds].sort().map((id) => ({
    id,
    label: titleCase(id),
    path: id,
    showInNav: true,
    showOnHome: true,
    sectionTitle: id.replace(/-/g, ' ').toUpperCase(),
    layout: 'grid' as const,
  }));

  return [...configured, ...autoSections];
}

/** Like getLocalSections but includes auto-discovered sections */
export async function getAllLocalSections(config?: SiteConfig): Promise<SectionConfig[]> {
  const all = await discoverAllSections(config);
  return all.filter((s) => !isExternalUrl(s.path));
}

/**
 * Get articles for the home page.
 * When sections configured: only return articles from showOnHome:true sections + root-level articles.
 * When no sections: return all (backward compat).
 */
export async function getHomeArticles(config?: SiteConfig) {
  const articles = await getPublishedArticles();
  const sections = getSections(config);

  if (sections.length === 0) {
    return articles;
  }

  return articles.filter((article) => {
    const sectionId = getSectionFromSlug(article.slug);

    // Root-level articles (no subfolder) always show on home
    if (!sectionId) return true;

    // Check if this article's section is configured
    const section = sections.find((s) => s.id === sectionId);

    // Articles in unconfigured subfolders show on home by default
    if (!section) return true;

    // showOnHome defaults to true
    return section.showOnHome !== false;
  });
}

/** Returns the URL for a section: as-is if external, otherwise /path/ */
export function getSectionUrl(section: SectionConfig): string {
  if (isExternalUrl(section.path)) return section.path;
  return `/${section.path}/`;
}

/**
 * Merge auto-injected section nav links with manual header.navLinks.
 * Section links with showInNav:true are inserted after "Home".
 * Deduplicates by URL.
 */
export function getEffectiveNavLinks(config: SiteConfig, sections?: SectionConfig[]): Array<{ label: string; url: string; className?: string }> {
  const manualLinks = config.header.navLinks || [];
  sections = sections || getSections(config);

  const sectionNavLinks = sections
    .filter((s) => s.showInNav)
    .map((s) => ({ label: s.label, url: getSectionUrl(s) }));

  if (sectionNavLinks.length === 0) return manualLinks;

  // Find "Home" link index to insert after it
  const homeIndex = manualLinks.findIndex(
    (l) => l.url === '/' || l.label.toLowerCase() === 'home'
  );

  // Build merged list: [Home, ...sectionLinks, ...rest of manual links]
  const before = homeIndex >= 0 ? manualLinks.slice(0, homeIndex + 1) : [];
  const after = homeIndex >= 0 ? manualLinks.slice(homeIndex + 1) : manualLinks;

  const merged = [...before, ...sectionNavLinks, ...after];

  // Deduplicate by URL (keep first occurrence)
  const seen = new Set<string>();
  return merged.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}
