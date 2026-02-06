/**
 * Folder-based content plan types
 *
 * These types support the "Filesystem-as-Plan" architecture where
 * the folder structure IS the content plan.
 */

// ============================================================================
// Unified Serializer Types
// ============================================================================

/**
 * Options for the unified serializer
 */
export interface ISerializerOptions {
  /** Base filename for the JSON file (default: 'index') */
  baseFilename?: string;
  /** Whether to sync override files when writing (default: true) */
  syncOverrides?: boolean;
}

/**
 * Metadata about the serialization state
 */
export interface ISerializerMeta {
  /** Absolute path to the folder */
  basePath: string;
  /** List of field names that were overridden by external files */
  overriddenFields: string[];
  /** Map of field name to override file path */
  overrideFiles: Map<string, string>;
}

/**
 * @deprecated Use last_pipeline instead. Kept for backward compatibility.
 * Last action applied to article - maps directly to CLI action names
 */
export type LastAction = 'plan-import' | 'article-seed' | 'generate' | 'enhance' | 'finalize';

/**
 * @deprecated Use LastAction instead. Kept for backward compatibility during migration.
 */
export type ArticleStatus = 'briefed' | 'draft' | 'reviewed' | 'enriched' | 'final';

/**
 * @deprecated Not used in code logic. Kept for backward compatibility.
 */
export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

/**
 * @deprecated Not used in code logic. Kept for backward compatibility.
 */
export type FunnelStage = 'top' | 'middle' | 'bottom';

/**
 * Color configuration for branding (used in hero images, social images, website template, etc.)
 */
export interface IBrandingColors {
  /** Primary brand color (e.g., "#3B82F6") */
  primary?: string;
  /** Text color on primary background (e.g., "#ffffff") */
  primary_text?: string;
  /** Secondary brand color (e.g., "#8B5CF6") */
  secondary?: string;
  /** Accent color for highlights (e.g., "#F59E0B") */
  accent?: string;
  /** Background color (e.g., "#FFFFFF") */
  background?: string;
  /** Secondary background color (e.g., "#F8FAFC") */
  background_secondary?: string;
  /** Primary text color (e.g., "#0F172A") */
  text_primary?: string;
  /** Secondary text color (e.g., "#475569") */
  text_secondary?: string;
  /** Muted text color (e.g., "#9CA3AF") */
  text_muted?: string;
  /** Border color (e.g., "#E2E8F0") */
  border?: string;
}

/**
 * Dark mode configuration for branding
 */
export interface IBrandingDarkMode {
  enabled?: boolean;
  default?: 'light' | 'dark';
  toggle_position?: string;
  colors?: IBrandingColors;
}

/**
 * Site identity information
 */
export interface IBrandingSite {
  name?: string;
  tagline?: string;
  description?: string;
  url?: string;
  language?: string;
}

/**
 * Logo configuration
 */
export interface IBrandingLogo {
  type?: 'text' | 'image';
  text?: string;
  /** URL or data URI (data:image/png;base64,...) */
  image_url?: string;
  show_border?: boolean;
}

/**
 * Project-level branding configuration
 */
export interface IProjectBranding {
  badge?: string;
  brand_name?: string;
  site?: IBrandingSite;
  logo?: IBrandingLogo;
  /** Brand colors for image generation and website template */
  colors?: IBrandingColors;
  dark_mode?: IBrandingDarkMode;
}

/**
 * Configuration for publishing articles to a local folder
 */
export interface ILocalPublishConfig {
  /** Whether local publishing is enabled */
  enabled: boolean;
  /** Absolute path to the target project root */
  path: string;
  /** Subfolder within target project for content files (e.g., "src/content/blog") */
  content_subfolder: string;
  /** Subfolder within target project for asset files (e.g., "public/assets/blog") */
  assets_subfolder: string;
  /** Path to website template directory. Empty = skip template copy. */
  templatePath?: string;
  /** Settings merged with template's config.defaults.json → written to data/site-config.json */
  template_settings?: Record<string, unknown>;
}

/**
 * Project-level configuration stored in _project.yaml
 */
export interface IProjectConfig {
  /** Website/blog title (required) */
  title: string;
  /** Website URL (optional - can be added later) */
  url?: string;
  /** Website description */
  description?: string;
  /** Primary focus keywords (comma-separated) */
  focus_keywords?: string;
  /** Target audience description */
  audience?: string;
  /** Brand voice/tone description */
  brand_voice?: string;
  /** Default target word count for articles */
  default_target_words?: number;
  /** Project creation timestamp */
  created_at?: string;
  /** Last update timestamp */
  updated_at?: string;
  /** Project branding configuration (colors, etc.) */
  branding?: IProjectBranding;
  /** Configuration for publishing to a local folder */
  publish_to_local_folder?: ILocalPublishConfig;
}

/**
 * Internal link recommendation
 */
export interface IInternalLink {
  /** Target article slug */
  slug: string;
  /** Suggested anchor text */
  anchor: string;
}

/**
 * Complete article record stored in index.json (Filesystem-as-Plan architecture).
 * All fields are stored flat at the root level of index.json.
 *
 * Note: Despite the previous name "IArticleMeta", this represents the full article
 * including content-related fields like faq and jsonld.
 */
export interface IArticle {
  /** Article title */
  title: string;
  /** Article description - used for SEO meta tags */
  description?: string;
  /** Target keywords - used for SEO meta tags and JSON-LD */
  keywords: string[];
  /**
   * The last pipeline that processed this article.
   * - null or missing: Seed article (created by article-seed or plan-import, ready for generate)
   * - 'generate': Generated article (ready for enhance)
   * - 'enhance': Basic enhancement complete, publishable
   * - 'enhance-image-hero': Hero image generated, publishable
   * - 'enhance-image-og': OG image generated, publishable
   * - 'enhance-interlink-articles': Full enhancement with internal links, publishable
   *
   * Publishable = last_pipeline starts with 'enhance'
   */
  last_pipeline?: string | null;
  /** @deprecated Use last_pipeline instead */
  last_action?: LastAction;
  /** Current version number (for _history/) */
  version?: number;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Recommended internal links */
  internal_links?: IInternalLink[];

  /** Track which enhancement actions have been applied */
  applied_actions?: string[];

  /** Path to hero image (relative to assets folder) */
  image_hero?: string;

  /** Path to OG/social preview image (relative to assets folder) */
  image_og?: string;

  /**
   * When the article should be published (ISO datetime or YYYY-MM-DD).
   * If not set, defaults to created_at during rendering.
   * Used for scheduling future articles.
   */
  published_at?: string;

  /** FAQ section HTML content (extracted from content, stored separately) */
  faq?: string;

  /** JSON-LD script blocks (all <script type="application/ld+json"> elements) */
  jsonld?: string;

  /** Article content (markdown) - unified object pattern */
  content?: string;

  // ---- DEPRECATED FIELDS (kept for backward compatibility) ----
  /** @deprecated Folder path is the slug */
  slug?: string;
  /** @deprecated Use project default */
  target_words?: number;
  /** @deprecated Use last_action instead */
  status?: ArticleStatus;
  /** @deprecated Not used in code logic */
  search_intent?: SearchIntent;
  /** @deprecated Not used in code logic */
  funnel_stage?: FunnelStage;
  /** @deprecated Not used - we sort by created_at */
  priority?: 1 | 2 | 3;
  /** @deprecated Folder path provides grouping */
  cluster?: string;
}

/** @deprecated Use IArticle instead */
export type IArticleMeta = IArticle;

/**
 * Article folder representation (in-memory)
 * Combines metadata with content and path info
 */
export interface IArticleFolder {
  /** Relative path from content/ (e.g., "blog/tutorials/getting-started") */
  path: string;
  /** Article record from index.json */
  meta: IArticle;
  /** Current index.md content */
  content?: string;
  /** Absolute filesystem path to the folder */
  absolutePath: string;
}

/**
 * Summary of content plan status
 */
export interface IPlanSummary {
  /** Total number of articles in plan */
  total: number;
  /** Count by status */
  byStatus: Record<ArticleStatus, number>;
  /** List of article paths */
  articles: Array<{
    path: string;
    title: string;
    status: ArticleStatus;
  }>;
}

/**
 * Version history entry
 * Format: {datetime}-{action}-{index|meta}.md
 */
export interface IVersionEntry {
  /** ISO datetime when archived */
  datetime: string;
  /** Action that was applied (e.g., 'generate', 'enhance') */
  action: string;
  /** Filename of index.md in _history/ */
  indexFile: string;
  /** Filename of meta.md in _history/ */
  metaFile: string;
}

/**
 * Import plan format detection
 */
export type PlanImportFormat = 'json' | 'yaml' | 'markdown';

/**
 * Result of plan import operation
 */
export interface IPlanImportResult {
  /** Number of articles created */
  created: number;
  /** Number of articles skipped (already exist) */
  skipped: number;
  /** Paths of created articles */
  createdPaths: string[];
  /** Paths of skipped articles */
  skippedPaths: string[];
  /** Any errors encountered */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Conflict type for import preview
 */
export type ImportConflictType = 'new' | 'seed_replace' | 'skip';

/**
 * Pre-import analysis result for a single item
 */
export interface IImportPreviewItem {
  /** Article title */
  title: string;
  /** Original slug from plan */
  slug: string;
  /** Resolved article path */
  articlePath: string;
  /** Conflict type detected */
  conflict: ImportConflictType;
  /** For skip conflicts, the existing pipeline stage */
  existingPipeline?: string;
}

/**
 * Resolution result for a conflict
 */
export type ConflictResolution = 'create' | 'replace' | 'skip' | 'fail';

/**
 * Resolved import item after user confirmation
 */
export interface IResolvedImportItem extends IImportPreviewItem {
  /** Action to take */
  action: ConflictResolution;
  /** Final path (may differ from articlePath if renamed) */
  finalPath: string;
}
