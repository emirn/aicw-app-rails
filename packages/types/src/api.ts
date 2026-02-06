/**
 * API request/response types
 */

import { IApiArticle } from './article';
import { IWebsiteInfo } from './website';
import { IFileAsset } from './asset';
import { IContentPlan } from './plan';
import { ActionMode, OutputMode } from './action';
import { IUsageStats, IDebugInfo } from './usage';

/**
 * Prompt parts for article generation
 * Loaded from project's prompts/write_draft/ folder
 */
export interface IPromptParts {
  /** Unified project requirements - all sections combined in one file */
  project_requirements: string;
  /** Optional custom prompt template - loaded from project's config/actions/write_draft/prompt.md */
  custom_prompt_template?: string;
  /** Optional custom.md content - loaded from project's config/actions/write_draft/custom.md */
  custom_content?: string;
}

// Article generation request
export interface INewArticleBody {
  description: string;
  website_info: IWebsiteInfo;
  /** @deprecated Word count should be specified in prompts/write_draft/prompt.md */
  target_words?: number;
  assets?: IFileAsset[];
  references?: IFileAsset[];
  /** Required prompt parts from project's prompts/write_draft/requirements.md */
  prompt_parts: IPromptParts;
}

// Article generation response
export interface INewArticleResponse {
  article: IApiArticle;
  success: boolean;
  error?: string;
  usage?: IUsageStats;
  tokens_used?: number;  // Deprecated: use usage.tokens_used
  cost_usd?: number;     // Deprecated: use usage.cost_usd
  assets?: IFileAsset[];
  references?: IFileAsset[];
  debug?: IDebugInfo;
}

// Article update request
export interface IArticleUpdateBody {
  article: IApiArticle;
  mode: ActionMode;
  output_mode?: OutputMode;
  context?: any;
  assets?: IFileAsset[];
  references?: IFileAsset[];
}

// Article update response
export interface IArticleUpdateResponse {
  article: IApiArticle;
  success: boolean;
  error?: string;
  changes_made?: string[];
  usage?: IUsageStats;
  tokens_used?: number;  // Deprecated: use usage.tokens_used
  cost_usd?: number;     // Deprecated: use usage.cost_usd
  assets?: IFileAsset[];
  references?: IFileAsset[];
  debug?: IDebugInfo;
}

// Content plan request
export interface IWebsitePlanRequest {
  website_info: IWebsiteInfo;
  target_articles?: number;
  ideas?: string[];
  additional_context?: string;
}

// Content plan response
export interface IWebsitePlanResponse {
  plan: IContentPlan;
  success: boolean;
  error?: string;
  usage?: IUsageStats;
  tokens_used?: number;  // Deprecated: use usage.tokens_used
  cost_usd?: number;     // Deprecated: use usage.cost_usd
  debug?: IDebugInfo;
}

// Pipelines configuration
export interface IPipelineAction {
  mode: ActionMode;
}

export interface IPipelineConfig {
  description: string;
  actions: IPipelineAction[];
}

export interface IPipelinesConfig {
  pipelines: Record<string, IPipelineConfig>;
}

// Default template response
export interface IDefaultTemplateResponse {
  success: boolean;
  template?: string;
  error?: string;
}
