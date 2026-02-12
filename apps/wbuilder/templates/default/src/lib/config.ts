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
      favicon_url?: string;
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
  gradient?: [string, string, string];
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
      target?: '_self' | '_blank';
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
      instagram?: string;
      youtube?: string;
      github?: string;
      tiktok?: string;
      bluesky?: string;
      threads?: string;
      rss?: boolean;
    };
    copyrightText?: string;
    poweredByText?: string;
    poweredByUrl?: string;
    showPoweredBy?: boolean;
  };
  newsletter?: {
    enabled?: boolean;
    position?: 'footer' | 'after-content';
    code?: string;
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
  /**
   * Content sections configuration. Maps article subfolders to section metadata.
   * When configured, enables section index pages, nav auto-injection, and home page filtering.
   * Sites without sections config work exactly as before.
   */
  sections?: SectionConfig[];
}

export interface SectionConfig {
  /** Must match subfolder name in src/content/articles/ */
  id: string;
  /** Display name (e.g., "Legal AI Tools") */
  label: string;
  /** URL path prefix (usually same as id), OR absolute URL (https://...) for nav-only links */
  path: string;
  /** Auto-add to header nav. Default: false */
  showInNav?: boolean;
  /** Show articles on home page. Default: true */
  showOnHome?: boolean;
  /** Uppercase label above grid (e.g., "LEGAL AI TOOLS") */
  sectionTitle?: string;
  /** Meta description for section index page */
  description?: string;
  /** Override blog.postsPerPage for this section */
  postsPerPage?: number;
  /** Article display layout. 'grid' = tile cards, 'list' = horizontal rows. Default: 'grid' */
  layout?: 'grid' | 'list';
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
      favicon_url: '',
    },
    logo: {
      type: 'text',
      text: 'Blog',
      show_border: true,
    },
    colors: {
      primary: '',
      secondary: '',
      primary_text: '',
      background: '',
      background_secondary: '',
      text_primary: '',
      text_secondary: '',
      text_muted: '',
      border: '',
    },
    dark_mode: {
      enabled: true,
      default: 'dark',
      toggle_position: 'footer',
      colors: {
        text_primary: '',
        text_secondary: '',
        text_muted: '',
        background: '',
        background_secondary: '',
        border: '',
      },
    },
  },
  hero: {
    enabled: true,
    title: 'Welcome to the Blog',
    subtitle: 'Your compelling tagline goes here.',
    showOnAllPages: false,
  },
  gradient: ['', '', ''],
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
    poweredByText: '',
    poweredByUrl: '',
    showPoweredBy: false,
  },
  newsletter: {
    enabled: false,
    position: 'footer',
    code: '',
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

export function getConfig(): SiteConfig {
  return deepMerge(defaultConfig, siteConfigData as Partial<SiteConfig>);
}

export function replacePlaceholders(text: string, config: SiteConfig): string {
  return text
    .replace(/\{\{YEAR\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{SITE_NAME\}\}/g, config.branding.site.name);
}

/**
 * Get default author name for articles
 */
export function getDefaultAuthor(config: SiteConfig): string {
  return `Content Team at ${config.branding.site.name}`;
}

/**
 * Generate an SVG favicon as a data URI with first letter of site name
 */
export function generateLetterFavicon(siteName: string, bgColor: string): string {
  const letter = getFirstLetter(siteName);
  const textColor = isLightColor(bgColor) ? '#1F2937' : '#FFFFFF';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="6" fill="${bgColor}"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="18" font-weight="600" fill="${textColor}">
      ${letter}
    </text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getFirstLetter(siteName: string): string {
  if (!siteName?.trim()) return '?';
  const match = siteName.trim().match(/[a-zA-Z0-9]/);
  return match ? match[0].toUpperCase() : '?';
}

function isLightColor(hex: string): boolean {
  const color = hex.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}
