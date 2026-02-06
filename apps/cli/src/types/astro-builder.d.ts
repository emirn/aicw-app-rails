/**
 * Type declarations for the astro-builder.js module
 * from aicw-website-builder/api-server/src/astro-builder.js
 */

export interface BuildAstroSiteOptions {
  /** Path to the astro-blog template */
  templateDir: string;
  /** Path to output the built site */
  outputDir: string;
  /** Site configuration object */
  config: SiteConfig;
  /** Array of articles to include */
  articles: AstroArticle[];
  /** Path to the job directory (for assets) */
  jobDir: string;
  /** Logging function */
  logFn?: (message: string) => void;
}

export interface SiteConfig {
  site?: {
    name?: string;
    url?: string;
    description?: string;
  };
  logo?: {
    type?: 'text' | 'image';
    text?: string;
    src?: string;
  };
  header?: {
    navLinks?: Array<{ label: string; url: string }>;
    ctaButton?: {
      enabled?: boolean;
      label?: string;
      url?: string;
    };
  };
  footer?: {
    columns?: Array<unknown>;
    showPoweredBy?: boolean;
  };
  [key: string]: unknown;
}

export interface AstroArticle {
  slug: string;
  meta: {
    title: string;
    description?: string;
    keywords?: string[];
    date: string;
    date_updated_at?: string;
    image_hero?: string;
    image_og?: string;
    author?: string;
    categories?: string[];
    tags?: string[];
  };
  content: string;
}

export interface BuildResult {
  totalArticles: number;
  totalPages: number;
  outputDir: string;
}

export function buildAstroSite(options: BuildAstroSiteOptions): Promise<BuildResult>;
