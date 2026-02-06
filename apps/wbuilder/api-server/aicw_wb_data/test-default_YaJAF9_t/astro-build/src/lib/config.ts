import siteConfigData from '../../data/site-config.json';

export interface SiteConfig {
  branding: {
    badge?: string;
    brand_name?: string;
    site: {
      name: string;
      tagline?: string;
      description?: string;
      url: string;
      language?: string;
      faviconUrl?: string;
    };
    logo: {
      type: 'text' | 'image';
      text?: string;
      image_url?: string;
      show_border?: boolean;
    };
    colors: {
      primary: string;
      secondary: string;
      accent?: string;
      primary_text?: string;
      background: string;
      background_secondary: string;
      text_primary: string;
      text_secondary: string;
      text_muted?: string;
      border: string;
    };
    dark_mode: {
      enabled: boolean;
      default?: 'light' | 'dark';
      toggle_position?: string;
      colors: {
        text_primary: string;
        text_secondary: string;
        text_muted?: string;
        background: string;
        background_secondary: string;
        border: string;
      };
    };
  };
  hero: {
    enabled: boolean;
    title?: string;
    subtitle?: string;
    showOnAllPages?: boolean;
  };
  typography: {
    fontFamily?: string;
    headingFontFamily?: string;
    googleFonts?: string[];
  };
  header: {
    style?: string;
    showSearch?: boolean;
    navLinks: Array<{
      label: string;
      url: string;
      /** Optional Tailwind classes for custom styling (e.g., button styles) */
      className?: string;
    }>;
    ctaButton?: {
      enabled: boolean;
      label: string;
      url: string;
      style?: string;
      /** Optional Tailwind classes for custom CTA styling */
      className?: string;
    };
  };
  footer: {
    showLogo?: boolean;
    showTagline?: boolean;
    columns: Array<{
      title: string;
      links: Array<{
        label: string;
        url: string;
        /** Optional Tailwind classes for custom styling */
        className?: string;
      }>;
    }>;
    socialLinks?: {
      twitter?: string;
      linkedin?: string;
      facebook?: string;
      rss?: boolean;
    };
    copyrightText?: string;
    poweredByText?: string;
    showPoweredBy?: boolean;
  };
  blog: {
    sectionTitle?: string;
    postsPerPage: number;
    showCategories?: boolean;
    showDate?: boolean;
    showAuthor?: boolean;
    showExcerpt?: boolean;
    showReadingTime?: boolean;
    showTableOfContents?: boolean;
    showRelatedPosts?: boolean;
    paginationStyle?: string;
    dateFormat?: string;
  };
  article: {
    showSocialShare?: boolean;
    socialShareButtons?: string[];
    showAuthorBio?: boolean;
    showTags?: boolean;
  };
  seo: {
    titleSeparator?: string;
    defaultOgImage?: string;
    twitterHandle?: string;
    enableJsonLd?: boolean;
    /**
     * Override the canonical URL domain. Useful when site is hosted on
     * sites.pgndr.com but should be indexed under a custom domain.
     * Example: "https://myblog.com" - canonical URLs will use this instead of site.url
     */
    canonicalDomain?: string;
    /**
     * If true, adds noindex meta tag to prevent search engine indexing.
     * Useful for staging/preview sites.
     */
    robotsNoIndex?: boolean;
    /**
     * If true, shows a red preview banner at the top of the page when robotsNoIndex is enabled.
     * Defaults to true when robotsNoIndex is true.
     */
    showPreviewBanner?: boolean;
    /**
     * Custom text for the preview banner.
     * Defaults to "Preview Mode - This site is not indexed by search engines"
     */
    previewBannerText?: string;
    /**
     * JSON-LD schema configuration for structured data
     */
    jsonLd?: {
      /** Organization name for publisher schema (defaults to site.name) */
      organizationName?: string;
      /** Organization logo URL for publisher schema */
      organizationLogo?: string;
    };
  };
  /**
   * Category pages configuration
   */
  categories?: {
    /** Enable category archive pages. Defaults to false. */
    enabled?: boolean;
    /** Show /categories/ index page. Defaults to true when enabled. */
    showIndex?: boolean;
    /** URL prefix for category pages. Defaults to 'category'. */
    urlPrefix?: string;
  };
  /**
   * Search configuration using Pagefind
   */
  search?: {
    /** Enable client-side search. Defaults to false. */
    enabled?: boolean;
    /** Placeholder text for search input */
    placeholder?: string;
    /** Show search trigger in header. Defaults to true when enabled. */
    showInHeader?: boolean;
  };
  /**
   * llms.txt generation configuration
   */
  llmsTxt?: {
    /** Enable llms.txt generation at /llms.txt. Defaults to false. */
    enabled?: boolean;
    /** Include article list in llms.txt. Defaults to true. */
    includeArticles?: boolean;
    /** Maximum number of articles to list. Defaults to 50. */
    maxArticles?: number;
    /** Include category list in llms.txt. Defaults to true. */
    includeCategories?: boolean;
  };
  tracking: {
    widgetCode?: string;
    customHeadCode?: string;
    customBodyCode?: string;
  };
  /**
   * AICW-specific tracking configuration.
   * When enabled, injects the AICW analytics script.
   */
  aicw?: {
    /**
     * Enable/disable AICW tracking. Defaults to false.
     */
    enabled?: boolean;
    /**
     * AICW tracking ID (e.g., "abc123xyz")
     */
    trackingId?: string;
    /**
     * Domain to track. Should match the canonical domain.
     * If not specified, will use canonicalDomain or site.url.
     */
    domain?: string;
  };
}

// Default configuration
const defaultConfig: SiteConfig = {
  branding: {
    badge: '',
    brand_name: 'My Blog',
    site: {
      name: 'My Blog',
      tagline: 'Insights and updates',
      description: 'A blog about...',
      url: 'https://example.com',
      language: 'en',
    },
    logo: {
      type: 'text',
      text: 'Blog',
      image_url: '',
      show_border: true,
    },
    colors: {
      primary: '#3B82F6',
      secondary: '#2563EB',
      accent: '#f5576c',
      primary_text: '#FFFFFF',
      background: '#FFFFFF',
      background_secondary: '#F8FAFC',
      text_primary: '#0F172A',
      text_secondary: '#475569',
      text_muted: '#9CA3AF',
      border: '#E2E8F0',
    },
    dark_mode: {
      enabled: true,
      default: 'dark',
      toggle_position: 'footer',
      colors: {
        text_primary: '#FFFFFF',
        text_secondary: '#D1D5DB',
        text_muted: '#9CA3AF',
        background: '#111827',
        background_secondary: '#1F2937',
        border: '#374151',
      },
    },
  },
  hero: {
    enabled: true,
    title: 'Welcome to the Blog',
    subtitle: 'Your compelling tagline goes here.',
    showOnAllPages: false,
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    headingFontFamily: 'Inter, system-ui, sans-serif',
    googleFonts: ['Inter:wght@400;500;600;700'],
  },
  header: {
    style: 'pill',
    showSearch: false,
    navLinks: [{ label: 'Home', url: '/' }],
  },
  footer: {
    showLogo: true,
    showTagline: true,
    columns: [],
    socialLinks: { rss: true },
    copyrightText: '{{YEAR}} {{SITE_NAME}}',
    poweredByText: 'Published with AICW.io',
    showPoweredBy: true,
  },
  blog: {
    sectionTitle: 'LATEST',
    postsPerPage: 9,
    showCategories: false,
    showDate: true,
    showAuthor: true,
    showExcerpt: true,
    showReadingTime: false,
    showTableOfContents: true,
    showRelatedPosts: true,
    paginationStyle: 'pages',
    dateFormat: 'MMM d, yyyy',
  },
  article: {
    showSocialShare: true,
    socialShareButtons: ['facebook', 'linkedin', 'twitter', 'copy'],
    showAuthorBio: false,
    showTags: false,
  },
  seo: {
    titleSeparator: ' | ',
    enableJsonLd: true,
    robotsNoIndex: false,
    jsonLd: {},
  },
  tracking: {},
  aicw: {
    enabled: false,
  },
  categories: {
    enabled: false,
    showIndex: true,
    urlPrefix: 'category',
  },
  search: {
    enabled: false,
    placeholder: 'Search articles...',
    showInHeader: true,
  },
  llmsTxt: {
    enabled: false,
    includeArticles: true,
    maxArticles: 50,
    includeCategories: true,
  },
};

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target } as T;
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      result[key] = deepMerge(result[key] as object || {}, sourceValue as object) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }
  return result;
}

function migrateOldConfig(data: any): any {
  const result = { ...data };

  // Migrate top-level "colors" → "branding.colors"
  if (result.colors && !result.branding?.colors) {
    const { primaryHover, textPrimary, textSecondary, textMuted,
            backgroundSecondary, ...rest } = result.colors;
    result.branding = {
      ...result.branding,
      colors: { ...rest, secondary: primaryHover, text_primary: textPrimary,
        text_secondary: textSecondary, text_muted: textMuted,
        background_secondary: backgroundSecondary },
    };
    delete result.colors;
  }

  // Migrate top-level "darkMode" → "branding.dark_mode"
  if (result.darkMode && !result.branding?.dark_mode) {
    const dm = result.darkMode;
    const { textPrimary, textSecondary, textMuted,
            backgroundSecondary, ...dmRest } = dm.colors || {};
    result.branding = {
      ...result.branding,
      dark_mode: { ...dm, toggle_position: dm.togglePosition,
        colors: { ...dmRest, text_primary: textPrimary, text_secondary: textSecondary,
          text_muted: textMuted, background_secondary: backgroundSecondary } },
    };
    delete result.branding.dark_mode.togglePosition;
    delete result.darkMode;
  }

  // Migrate top-level "site" → "branding.site"
  if (result.site && !result.branding?.site) {
    result.branding = { ...result.branding, site: result.site };
    delete result.site;
  }

  // Migrate top-level "logo" → "branding.logo"
  if (result.logo && !result.branding?.logo) {
    const { imageUrl, showBorder, borderColor, ...logoRest } = result.logo;
    result.branding = {
      ...result.branding,
      logo: { ...logoRest, image_url: imageUrl, show_border: showBorder },
    };
    delete result.logo;
  }

  return result;
}

export function getConfig(): SiteConfig {
  const data = migrateOldConfig(siteConfigData as any);
  return deepMerge(defaultConfig, data as Partial<SiteConfig>);
}

export function replacePlaceholders(text: string, config: SiteConfig): string {
  return text
    .replace(/\{\{YEAR\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{SITE_NAME\}\}/g, config.branding.site.name);
}
