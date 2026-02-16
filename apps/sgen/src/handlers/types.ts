/**
 * Unified Action Handler Types
 *
 * These types define the interface between API and CLI.
 * CLI sends context, API returns file operations.
 */

import { IProjectConfig, IArticle, IPromptParts } from '@blogpostgen/types';
import { ContentStats } from '../utils/content-stats';

/**
 * Context sent from CLI to API
 * CLI builds this from the path argument
 *
 * Uses unified object pattern: `article` contains the full IArticle including content field
 */
export interface ActionContext {
  pipelineName?: string;
  projectName?: string;
  articlePath?: string;
  projectConfig?: IProjectConfig;

  /** Unified article object (includes content field) */
  article?: IArticle;

  /** For plan-import: free-form text content plan to parse */
  planText?: string;
  /** Custom prompt parts for article generation (from project's prompts/write_draft// folder) */
  promptParts?: IPromptParts;
  /** For interlink-articles: raw sitemap.xml content from project's website */
  sitemap_xml?: string;
  /** For batch operations: list of articles to process */
  articles?: Array<{
    path: string;
    article: IArticle;
  }>;
  /** Pre-calculated total cost (CLI computes before stripping costs from articles) */
  totalCost?: number;
}

/**
 * Request to execute an action
 */
export interface ActionExecuteRequest {
  action: string;
  flags: Record<string, any>;
  context: ActionContext;
}

/**
 * File operation types
 * CLI executes these blindly without knowing action semantics
 */
export type FileOperationType =
  | 'create_project'
  | 'create_article'
  | 'update_article'
  | 'update_meta';

/**
 * A single file operation for CLI to execute
 *
 * Uses unified object pattern: `article` contains the full IArticle including content field
 */
export interface FileOperation {
  type: FileOperationType;

  /** For create_project */
  projectName?: string;
  projectConfig?: IProjectConfig;

  /** For create_article / update_article - path to article folder */
  articlePath?: string;

  /** Unified article object (includes content field) */
  article?: IArticle;

  /** For update_meta only - partial updates */
  metaUpdates?: Partial<IArticle>;

  /** Action name for history archive naming (e.g., "fact_check", "humanize_text") */
  action_name?: string;

  /** Raw AI response when content extraction failed - CLI writes to index_failed.md */
  failedContent?: string;
}

/**
 * Response from action execution
 */
export interface ActionExecuteResponse {
  success: boolean;
  error?: string;
  errorCode?: string;
  message?: string;
  tokensUsed?: number;
  costUsd?: number;

  /** True if action was skipped (e.g., already applied) - pipeline should continue */
  skipped?: boolean;

  /** The prompt that was sent to AI (for history/debugging) */
  prompt?: string;

  /** Raw AI response (when debug flag set) */
  rawResponse?: string;

  /** File operations for CLI to execute */
  operations: FileOperation[];

  /** Generated files to write (e.g., hero images, diagrams) */
  files?: Array<{
    path: string;      // Relative path within article folder
    content: string;   // Base64-encoded file content
  }>;

  /** Batch operation stats */
  batch?: {
    total: number;
    processed: number;
    errors: Array<{ path: string; error: string }>;
  };

  /** Read-only data (for status action) */
  data?: Record<string, any>;

  /** Content stats (before/after word counts, headings, links, checklists) */
  contentStats?: ContentStats;

  /** When true, CLI should fail if action made no content changes */
  requireChanges?: boolean;
}

/**
 * Action definition loaded from cli-actions.json
 */
export interface ActionDefinition {
  name: string;
  description: string;
  usage: string;
  estimatedCost?: number;
  requiresPath: boolean;
  requiresArticle: boolean;
  validStatuses?: string[];
  parameters: Record<string, {
    type: string;
    required?: boolean;
    default?: any;
  }>;
}

/**
 * Handler function signature
 */
export type ActionHandler = (
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
) => Promise<ActionExecuteResponse>;
