/**
 * @blogpostgen/types
 * Shared TypeScript types for BlogPostGen
 */

// Base types
export { IBaseObject, IPage } from './base';

// Article types (API-level, used by sgen service)
export { IApiArticle } from './article';

// Website types
export {
  IBaseWebsiteInfo,
  IMainWebsiteInfo,
  ICompetitorWebsiteInfo,
  IWebsiteInfo,
  WebsiteInfo,
} from './website';

// Asset types
export { IFileAsset } from './asset';

// Plan types
export {
  IContentPlanItem,
  IContentPlan,
  ContentPlanItem,
  ContentPlan,
} from './plan';

// Action types
export {
  ActionMode,
  OutputMode,
  IActionConfig,
  ActionConfigMap,
} from './action';

// Usage types
export { IUsageStats, IDebugInfo } from './usage';

// API types
export {
  IPromptParts,
  INewArticleBody,
  INewArticleResponse,
  IArticleUpdateBody,
  IArticleUpdateResponse,
  IWebsitePlanRequest,
  IWebsitePlanResponse,
  IPipelineAction,
  IPipelineConfig,
  IPipelinesConfig,
} from './api';

// Folder-based plan types (Filesystem-as-Plan architecture)
export {
  ISerializerOptions,
  ISerializerMeta,
  LastAction,
  SearchIntent,
  FunnelStage,
  ArticleStatus,
  IBrandingColors,
  IProjectBranding,
  ILocalPublishConfig,
  IProjectConfig,
  IInternalLink,
  IArticle,
  IArticleMeta,  // deprecated alias for IArticle
  IArticleFolder,
  IPlanSummary,
  IVersionEntry,
  PlanImportFormat,
  IPlanImportResult,
  ImportConflictType,
  IImportPreviewItem,
  ConflictResolution,
  IResolvedImportItem,
} from './folder-plan';

// File/folder constants
export {
  META_FILE,
  LEGACY_META_FILE,
  PROJECT_CONFIG_FILE,
  LEGACY_PROJECT_CONFIG_FILE,
  ARTICLE_FILE,
  INDEX_FILE,
  CONTENT_OVERRIDE_FILE,
  HISTORY_DIR,
  SERIALIZED_FIELDS,
  SERIALIZED_FIELD_FILES,
} from './constants';
export type { SerializedField } from './constants';
