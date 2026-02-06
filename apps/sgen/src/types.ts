/**
 * Sgen service types - re-exports from shared types package
 */

// Re-export all shared types
export {
  // Base types
  IBaseObject,
  IPage,

  // Article types (API-level)
  IApiArticle,

  // Website types
  IBaseWebsiteInfo,
  IMainWebsiteInfo,
  ICompetitorWebsiteInfo,
  IWebsiteInfo,
  WebsiteInfo,

  // Asset types
  IFileAsset,

  // Plan types
  IContentPlanItem,
  IContentPlan,
  ContentPlanItem,
  ContentPlan,

  // Action types
  ActionMode,
  OutputMode,
  IActionConfig,
  ActionConfigMap,

  // Usage types
  IUsageStats,
  IDebugInfo,

  // API types
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
} from '@blogpostgen/types';
