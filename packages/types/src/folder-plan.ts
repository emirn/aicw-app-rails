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
 * Text logo display style
 * - plain: Bold text, no decoration
 * - bordered: Rounded border in primary color
 * - pill: Solid primary background, white text, fully rounded
 * - underline-hover: Sliding underline on hover
 * - gradient: Primary→secondary gradient text
 * - spaced-caps: Uppercase with wide letter-spacing
 */
export type LogoTextStyle = 'plain' | 'bordered' | 'pill' | 'underline-hover' | 'gradient' | 'spaced-caps';

/**
 * Logo configuration
 */
export interface IBrandingLogo {
  type?: 'text' | 'image';
  text?: string;
  /** URL or data URI (data:image/png;base64,...) */
  image_url?: string;
  /** @deprecated Use `style` instead. Kept for backward compatibility. */
  show_border?: boolean;
  /** Text logo display style. Defaults to 'plain'. */
  style?: LogoTextStyle;
}

/**
 * Typography configuration for branding (Google Fonts + CSS font-family)
 */
export interface IBrandingTypography {
  /** Body font CSS family (e.g., "Inter, system-ui, sans-serif") */
  font_family?: string;
  /** Heading font CSS family (e.g., "Playfair Display, serif") */
  heading_font_family?: string;
  /** Google Fonts specs (e.g., ["Inter:wght@400;500;600;700"]) */
  google_fonts?: string[];
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
  /**
   * Recraft illustration style for hero images.
   * Format: "base_style" or "base_style/substyle"
   * Default: "digital_illustration/pastel_gradient"
   * Browse styles: https://www.recraft.ai/styles?tag=digital_illustration
   *
   * Common values:
   * - "digital_illustration/pastel_gradient" (default — clean simple illustration style)
   * - "digital_illustration/hand_drawn"
   * - "digital_illustration/pixel_art"
   * - "digital_illustration/2d_art_poster"
   * - "digital_illustration/pop_art"
   * - "digital_illustration/grain"
   * - "digital_illustration/nostalgic_pastel"
   * - "vector_illustration" (flat vector graphics)
   * - "realistic_image" (photography-like)
   */
  illustration_style?: string;
  /** Typography settings (Google Fonts, font families) */
  typography?: IBrandingTypography;
  /** Gradient colors for OG image backgrounds [start, middle, end] */
  gradient?: [string, string, string];
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
  template_path?: string;
  /** Settings merged with template's config.defaults.json → written to data/site-config.json */
  template_settings?: Record<string, unknown>;
  /** Subfolder for custom pages content (default: "src/content/pages") */
  pages_subfolder?: string;
}

/**
 * Reviewer identity stored in project config
 */
export interface IReviewer {
  id: string;
  name: string;
  url: string;
}

/**
 * Review event stored per-article (denormalized for rendering)
 */
export interface IReviewEntry {
  reviewer_id: string;
  reviewer_name: string;
  reviewer_url: string;
  reviewed_at: string;
}

/**
 * Project-level configuration stored in _project.yaml
 */
export interface IProjectConfig {
  /** Website/blog title (required) */
  title: string;
  /** Website URL (optional - can be added later) */
  url?: string;
  /** Project creation timestamp */
  created_at?: string;
  /** Last update timestamp */
  updated_at?: string;
  /** Project branding configuration (colors, etc.) */
  branding?: IProjectBranding;
  /** Configuration for publishing to a local folder */
  publish_to_local_folder?: ILocalPublishConfig;
  /** Registered reviewers for human review workflow */
  reviewers?: IReviewer[];
  /** Remembered date limit for article filtering (YYYY-MM-DD). Empty string = cleared. */
  date_limit?: string;
}

/**
 * Internal link recommendation
 */
export interface IInternalLink {
  /** Target article path */
  path: string;
  /** Suggested anchor text */
  anchor: string;
}

/**
 * Cost tracking entry for an article action
 */
export interface ICostEntry {
  /** ISO timestamp of when the cost was incurred */
  created_at: string;
  /** Action name (e.g., "write_draft", "fact_check") */
  action: string;
  /** Cost in USD (0 for no-AI actions) */
  cost: number;
  /** Word count before the action (0 if not applicable) */
  words_before: number;
  /** Word count after the action */
  words_after: number;
  /** words_after - words_before */
  words_delta: number;
  /** Percentage change (0 if words_before=0) */
  words_delta_pct: number;
  /** Replacements/patches applied (0 if n/a) */
  changes: number;
}

/**
 * Complete article record stored in index.json (Filesystem-as-Plan architecture).
 * All fields are stored flat at the root level of index.json.
 *
 * Note: Despite the previous name "IArticleMeta", this represents the full article
 * including content-related fields like faq, content_jsonld, and faq_jsonld.
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

  /** Cost tracking entries for actions applied to this article */
  costs?: ICostEntry[];

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

  /** JSON-LD script blocks for article content (Article, WebPage, BreadcrumbList, Organization schemas) */
  content_jsonld?: string;

  /** JSON-LD script block for FAQ section (FAQPage schema) */
  faq_jsonld?: string;

  /** Table of Contents HTML (generated by add_toc, wrapped in <div id="toc">) */
  toc?: string;

  /** Article content (markdown) - unified object pattern */
  content?: string;

  /** Tags for categorization (rendered as comma-separated string in frontmatter) */
  tags?: string[];

  /** Review events, newest first */
  reviewed_by?: IReviewEntry[];

  // ---- DEPRECATED FIELDS (kept for backward compatibility) ----
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
  /** Original path from plan */
  path: string;
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
