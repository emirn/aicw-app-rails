/**
 * Type definitions for BlogPostGen CLI
 * Re-exports shared types + CLI-specific types
 */

// Re-export shared types
export {
  // Base types
  IBaseObject,
  IPage,

  // Article types
  IApiArticle,
  IArticle,

  // Website types
  IBaseWebsiteInfo,
  IMainWebsiteInfo,
  ICompetitorWebsiteInfo,
  IWebsiteInfo,

  // Asset types
  IFileAsset,

  // Plan types
  IContentPlanItem,
  IContentPlan,

  // Action types
  ActionMode,
  OutputMode,

  // Usage types
  IUsageStats,
  IDebugInfo,

  // API types
  INewArticleBody,
  INewArticleResponse,
  IArticleUpdateBody,
  IArticleUpdateResponse,
  IWebsitePlanRequest,
  IWebsitePlanResponse,
  IPipelineAction,
  IPipelineConfig,
  IPipelinesConfig,
} from '@blogpostgen/types';

// Import types for internal use
import type {
  IApiArticle,
  IArticle,
  IWebsiteInfo as SharedWebsiteInfo,
  IContentPlan as SharedContentPlan,
  IContentPlanItem as SharedContentPlanItem,
  IFileAsset,
  INewArticleResponse,
  IArticleUpdateResponse,
  IWebsitePlanResponse,
  IUsageStats,
  IDebugInfo,
} from '@blogpostgen/types';

// ============================================================================
// CLI-specific types
// ============================================================================

export interface FileInput {
  path: string;
  usage: 'asset' | 'reference';
  alt_text?: string;
  caption?: string;
  placement_hint?: string;
}

export interface CLIOptions {
  base: string;
  url: string;
  target: number;
  articles: number;
  ideas: string[];
  timeout: number;
  assets?: FileInput[];
  references?: FileInput[];
  projectName?: string;

  // Manual input options
  websiteTitle?: string;
  websiteDescription?: string;
  keywords?: string;
  audience?: string;
  brandVoice?: string;
  additionalContext?: string;

  // Interactive mode options
  interactive?: boolean;
  autoEdit?: boolean;
  skipSitemap?: boolean;

  // Pipeline options
  pipeline?: string;
  resume?: boolean;
  forcePlan?: boolean;
}

// Note: CLI uses IFileAsset from shared types for all assets
// Diagram rendering converts directly to IFileAsset format

export interface Project {
  name: string;
  url: string;
  website_info?: SharedWebsiteInfo;
  created_at: string;
  updated_at: string;
  article_count?: number;
}

// ============================================================================
// Type aliases for backward compatibility
// These map legacy CLI types to shared types
// ============================================================================

// Article is an alias for IApiArticle (API-level article structure)
// Used in checkpoint tracking and HTTP client responses
export type Article = IApiArticle;

// WebsiteInfo is the shared type
export type WebsiteInfo = SharedWebsiteInfo;

// ContentPlan types are the shared types
export type ContentPlanItem = SharedContentPlanItem;
export type ContentPlan = SharedContentPlan;

// ArticleResponse combines both generate and update responses
export interface ArticleResponse {
  article: IApiArticle;
  assets?: IFileAsset[];
  references?: IFileAsset[];
  success: boolean;
  error?: string;
  tokens_used?: number;
  cost_usd?: number;
  changes_made?: string[];
  usage?: IUsageStats;
  debug?: IDebugInfo;
}

// PlanResponse maps to IWebsitePlanResponse
export interface PlanResponse {
  plan: SharedContentPlan;
  success: boolean;
  error?: string;
  usage?: IUsageStats;
  tokens_used?: number;
  cost_usd?: number;
  debug?: IDebugInfo;
}
