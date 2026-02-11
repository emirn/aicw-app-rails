/**
 * API Executor - Unified Action System
 *
 * CLI is dumb, API is smart.
 * - Builds context from path
 * - Sends { action, flags, context } to API
 * - Executes returned file operations
 */

import path from 'path';
import { readFileSync } from 'fs';
import clipboardy from 'clipboardy';
import { SgenClient } from '../http-client';
import { Logger } from '../logger';
import {
  resolvePath,
  projectExists,
  readArticleContent,
  getProjectConfig,
  getArticles,
  projectNameFromUrl,
} from './path-resolver';
import {
  saveArticle,
  saveArticleWithAction,
  saveArticleWithPipeline,
  createArticleFolder,
  updateArticleMeta,
} from './folder-manager';
import { saveProjectConfig } from './project-config';
import { getProjectPaths, initializeProjectDirectories } from '../config/user-paths';
import { IProjectConfig, IArticle, IPromptParts } from '@blogpostgen/types';
import {
  loadPromptParts,
  PromptValidationError,
  MultiplePromptsError,
  promptPartsExist,
} from './prompt-loader';
import { loadActionPrompt, loadActionCustomContent } from './action-config-loader';

/**
 * Validate that project branding has required color fields configured.
 * Returns error message or null if valid.
 */
function validateBrandingColors(config: IProjectConfig, projectDir: string): string | null {
  const branding = config.branding;
  if (!branding?.colors) {
    return `Project branding colors are not configured.\n\nPlease edit: ${path.join(projectDir, 'index.json')}`;
  }

  const colors = branding.colors;
  const required = ['primary', 'secondary', 'background', 'text_primary'] as const;
  const missing: string[] = [];

  for (const key of required) {
    const val = colors[key];
    if (!val || typeof val !== 'string' || val.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    return `Project branding has empty or missing colors: ${missing.join(', ')}.\n\nPlease edit: ${path.join(projectDir, 'index.json')}`;
  }

  return null;
}

/**
 * Context sent to API
 * Uses unified article object pattern: article contains all metadata and content
 */
interface ActionContext {
  projectName?: string;
  articlePath?: string;
  projectConfig?: IProjectConfig;
  /** Unified article object (includes content field) */
  article?: IArticle;
  /** For plan-import: free-form text content plan to parse */
  planText?: string;
  /** Custom prompt parts for article generation */
  promptParts?: IPromptParts;
  /** For interlink-articles: raw sitemap.xml content from project's website */
  sitemap_xml?: string;
  /** For batch operations: list of articles to process */
  articles?: Array<{
    path: string;
    article: IArticle;
  }>;
}

/**
 * File operation from API
 * Uses unified article object pattern: article contains all metadata and content
 */
interface FileOperation {
  type: 'create_project' | 'create_article' | 'update_article' | 'update_meta';
  projectName?: string;
  projectConfig?: IProjectConfig;
  articlePath?: string;
  /** Unified article object (includes content field) */
  article?: IArticle;
  /** For update_meta only - partial updates */
  metaUpdates?: Partial<IArticle>;
  /** Action name for history archive naming (e.g., "fact_check", "humanize_text") */
  action_name?: string;
  /** Raw AI response when content extraction failed - write to index_failed.md */
  failedContent?: string;
}

/**
 * Generated file from API (e.g., from render_diagrams)
 */
interface GeneratedFile {
  path: string;      // Relative path within article folder (e.g., "assets/diagram-1.png")
  content: string;   // Base64-encoded file content
}

/**
 * API response
 */
interface ActionResponse {
  success: boolean;
  error?: string;
  errorCode?: string;
  message?: string;
  tokensUsed?: number;
  costUsd?: number;
  skipped?: boolean;  // True if action was skipped (e.g., already applied)
  prompt?: string;    // The prompt sent to AI (for history/debugging)
  rawResponse?: string;  // Raw AI response (when debug flag set)
  operations: FileOperation[];
  files?: GeneratedFile[];  // Generated files to write (e.g., rendered diagrams)
  batch?: {
    total: number;
    processed: number;
    errors: Array<{ path: string; error: string }>;
  };
  data?: Record<string, any>;
}

/**
 * Actions list response
 */
interface ActionsListResponse {
  success: boolean;
  actions: Array<{
    name: string;
    description: string;
    usage: string;
    estimatedCost?: number;
    requiresPath: boolean;
    requiresArticle: boolean;
  }>;
}

/**
 * Article filter for pipeline preprocessing
 */
interface ArticleFilter {
  last_pipeline: string | null;
}

/**
 * Pipeline configuration
 */
interface PipelineInfo {
  name: string;
  description: string;
  needsProject: boolean;
  needsFileInput: boolean;
  articleFilter: ArticleFilter | null;
  action_count: number;
}

/**
 * Full pipeline config with actions
 */
interface PipelineConfig extends PipelineInfo {
  actions: Array<{ action: string; enabled?: boolean }>;
}

/**
 * Pipelines list response
 */
interface PipelinesListResponse {
  success: boolean;
  publishableFilter?: string;  // Regex pattern for filtering publishable articles
  pipelines: PipelineInfo[];
}

/**
 * Single pipeline response
 */
interface PipelineConfigResponse {
  success: boolean;
  name: string;
  description: string;
  needsProject: boolean;
  needsFileInput: boolean;
  articleFilter: ArticleFilter | null;
  actions: Array<{ action: string; enabled?: boolean }>;
}

/**
 * API Executor class
 * Single unified interface to API - no per-action logic
 */
export class APIExecutor {
  private client: SgenClient;
  private logger: Logger;

  constructor(baseUrl: string, logger: Logger, timeout: number = 600000) {
    this.client = new SgenClient(baseUrl, logger, timeout);
    this.logger = logger;
  }

  /**
   * List available actions from API
   */
  async listActions(): Promise<{
    success: boolean;
    actions?: ActionsListResponse['actions'];
    error?: string;
  }> {
    try {
      const response = await this.client.get<ActionsListResponse>('/api/v1/cli/actions');
      return { success: true, actions: response.actions };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List available pipelines from API
   * Used to dynamically build CLI menu
   */
  async listPipelines(): Promise<{
    success: boolean;
    publishableFilter?: string;
    pipelines?: PipelineInfo[];
    error?: string;
  }> {
    try {
      const response = await this.client.get<PipelinesListResponse>('/api/v1/pipelines');
      return {
        success: true,
        publishableFilter: response.publishableFilter,
        pipelines: response.pipelines,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get full configuration for a specific pipeline
   * Includes actions list and preprocessing config
   */
  async getPipelineConfig(name: string): Promise<{
    success: boolean;
    config?: PipelineConfig;
    error?: string;
  }> {
    try {
      const response = await this.client.get<PipelineConfigResponse>(`/api/v1/pipelines/${name}`);
      if (!response.success) {
        return { success: false, error: `Pipeline '${name}' not found` };
      }
      return {
        success: true,
        config: {
          name: response.name,
          description: response.description,
          needsProject: response.needsProject,
          needsFileInput: response.needsFileInput,
          articleFilter: response.articleFilter,
          action_count: response.actions.length,
          actions: response.actions,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get action configuration from API
   * Includes prompt content and file paths for syncing
   */
  async getActionConfig(): Promise<{
    success: boolean;
    config?: Record<string, any>;
    error?: string;
  }> {
    try {
      const response = await this.client.get<{ success: boolean; config: Record<string, any> }>(
        '/api/v1/actions/config'
      );
      return { success: true, config: response.config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate project branding config via AI
   */
  async generateProjectConfig(body: {
    site_name: string;
    site_description: string;
    site_url?: string;
    color_preference?: string;
  }): Promise<{ success: boolean; branding?: any; error?: string; cost_usd?: number }> {
    try {
      return await this.client.generateProjectConfig(body);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Legacy: list commands (maps to actions)
   */
  async listCommands(): Promise<{
    success: boolean;
    commands?: Array<{ name: string; description: string; usage: string; estimatedCost?: number; local: boolean }>;
    error?: string;
  }> {
    const result = await this.listActions();
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      commands: result.actions?.map((a) => ({
        name: a.name,
        description: a.description,
        usage: a.usage,
        estimatedCost: a.estimatedCost,
        local: false,
      })),
    };
  }

  /**
   * Execute an action - THE main entry point
   *
   * 1. Build context from path
   * 2. Send to API
   * 3. Execute returned operations
   */
  async executeAction(
    action: string,
    pathArg: string | undefined,
    flags: Record<string, any>,
    options?: { debug?: boolean }
  ): Promise<{
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
    tokensUsed?: number;
    costUsd?: number;
    skipped?: boolean;  // True if action was skipped (e.g., already applied)
  }> {
    // Build context from path
    const context = await this.buildContext(action, pathArg, flags);

    this.logger.log(`Executing: ${action}`);

    try {
      // Special handling for plan-import: chunk large plans client-side
      if (action === 'plan-import' && context.planText) {
        return await this.executeChunkedPlanImport(context, flags);
      }

      // Send to API (pass debug flag if enabled)
      const flagsWithDebug = options?.debug ? { ...flags, debug: true } : flags;
      const response = await this.client.post<ActionResponse>('/api/v1/cli/execute', {
        action,
        flags: flagsWithDebug,
        context,
      });

      // Display debug info if enabled
      if (options?.debug && response.prompt) {
        this.logger.logDebug('PROMPT', response.prompt);
      }
      if (options?.debug && response.rawResponse) {
        this.logger.logDebug('AI RESPONSE', response.rawResponse);
      }

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Action failed',
        };
      }

      // Execute file operations
      const operationErrors: string[] = [];
      for (const op of response.operations || []) {
        try {
          await this.executeOperation(op, context.projectName, response.prompt);
        } catch (err) {
          operationErrors.push(`${op.type}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Handle files[] in response - write generated files (e.g., from render_diagrams)
      if (response.files && response.files.length > 0 && context.projectName) {
        const paths = getProjectPaths(context.projectName);
        const savedFiles: string[] = [];
        for (const file of response.files) {
          try {
            await this.writeGeneratedFile(paths.content, context.articlePath || '', file);
            savedFiles.push(path.join(paths.content, context.articlePath || '', file.path));
          } catch (err) {
            operationErrors.push(`write_file ${file.path}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        if (savedFiles.length > 0) {
          this.logger.log('Saved files:');
          for (const f of savedFiles) {
            this.logger.log(`  ${f}`);
          }
        }
      }

      if (operationErrors.length > 0) {
        this.logger.log(`Warnings during file operations: ${operationErrors.join(', ')}`);
      }

      // Log batch info if present
      if (response.batch) {
        this.logger.log(`Processed ${response.batch.processed}/${response.batch.total}`);
        if (response.batch.errors.length > 0) {
          for (const err of response.batch.errors) {
            this.logger.log(`  Error: ${err.path} - ${err.error}`);
          }
        }
      }

      return {
        success: true,
        message: response.message,
        data: response.data,
        tokensUsed: response.tokensUsed,
        costUsd: response.costUsd,
        skipped: response.skipped,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Legacy: execute command (maps to action)
   */
  async executeCommand(
    command: string,
    pathArg: string | undefined,
    flags: Record<string, any>
  ): Promise<{
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
    tokensUsed?: number;
    costUsd?: number;
  }> {
    return this.executeAction(command, pathArg, flags);
  }

  /**
   * Build context from path argument
   */
  private async buildContext(
    action: string,
    pathArg: string | undefined,
    flags: Record<string, any>
  ): Promise<ActionContext> {
    const context: ActionContext = {};

    // Special case: plan-import reads from file or clipboard
    if (action === 'plan-import') {
      // Get plan text from file or clipboard
      if (flags.file) {
        try {
          const filePath = path.resolve(flags.file);
          context.planText = readFileSync(filePath, 'utf8');
          this.logger.log(`Read plan from file: ${filePath} (${context.planText.length} chars)`);
        } catch (err) {
          throw new Error(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (flags.clipboard) {
        try {
          const clipboardContent = await clipboardy.read();
          context.planText = clipboardContent;
          this.logger.log(`Read plan from clipboard (${clipboardContent.length} chars)`);
        } catch (err) {
          throw new Error(`Failed to read clipboard: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Still need to resolve project path for config - REQUIRED
      if (pathArg) {
        try {
          const resolved = resolvePath(pathArg);
          context.projectName = resolved.projectName;

          if (await projectExists(resolved)) {
            const config = await getProjectConfig(resolved);
            if (config) {
              context.projectConfig = config;
              this.logger.log(`Loaded project config: branding=${!!config.branding}`);
            }
          }

          // projectConfig is required for plan-import
          if (!context.projectConfig) {
            throw new Error(
              `Project config (index.json) is required for plan-import. ` +
              `Run 'project-init' first or check that the project exists.`
            );
          }

          // Validate branding colors are configured (preflight check)
          const brandingError = validateBrandingColors(context.projectConfig, resolved.projectDir);
          if (brandingError) {
            throw new Error(brandingError);
          }
        } catch (err) {
          // Re-throw our validation errors
          if (err instanceof Error && (err.message.includes('Project config') || err.message.includes('branding'))) {
            throw err;
          }
          this.logger.log(`Path resolution warning: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        throw new Error('Project path is required for plan-import action.');
      }

      return context;
    }

    // No path provided - project path is required for all actions
    if (!pathArg) {
      throw new Error('Project path is required for all actions.');
    }

    try {
      const resolved = resolvePath(pathArg);
      context.projectName = resolved.projectName;
      context.articlePath = resolved.articlePath;

      // Read project config if exists - REQUIRED for all actions
      if (await projectExists(resolved)) {
        const config = await getProjectConfig(resolved);
        if (config) {
          context.projectConfig = config;
          this.logger.log(`Loaded project config: branding=${!!config.branding}, colors=${!!(config.branding as any)?.colors}`);
        } else {
          this.logger.log(`WARNING: Project exists but has no config (missing index.json)`);
        }
      } else {
        this.logger.log(`WARNING: Project does not exist: ${resolved.projectDir}`);
      }

      // projectConfig is required for all actions - fail early with clear error
      if (!context.projectConfig) {
        throw new Error(
          `Project config (index.json) is required but not found for project '${resolved.projectName}'. ` +
          `Run 'project-init' first or check that the project exists.`
        );
      }

      // Validate branding colors are configured (preflight check)
      const brandingError = validateBrandingColors(context.projectConfig, resolved.projectDir);
      if (brandingError) {
        throw new Error(brandingError);
      }

      // For generate action, load prompt parts from project
      if (action === 'generate') {
        const projectPaths = getProjectPaths(resolved.projectName);
        try {
          // Try to load prompt parts - will throw if files are missing/empty
          const promptParts = await loadPromptParts(projectPaths.root);
          context.promptParts = promptParts;

          // Load custom prompt template if exists (optional)
          const customPrompt = await loadActionPrompt(projectPaths.root, 'write_draft');
          if (customPrompt) {
            context.promptParts.custom_prompt_template = customPrompt;
            this.logger.log('Loaded custom write_draft prompt template');
          }

          // Load custom.md content if exists (optional)
          const customContent = await loadActionCustomContent(projectPaths.root, 'write_draft');
          if (customContent) {
            context.promptParts.custom_content = customContent;
            this.logger.log('Loaded custom write_draft custom.md');
          }
        } catch (err) {
          // Re-throw prompt validation errors to stop execution
          if (err instanceof PromptValidationError || err instanceof MultiplePromptsError) {
            throw err;
          }
          // Log other errors but continue (optional prompt parts)
          this.logger.log(`Prompt loading warning: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // For enhance action with generate_image_hero mode, load custom prompt template and variables
      if (action === 'enhance' && flags.mode === 'generate_image_hero') {
        const projectPaths = getProjectPaths(resolved.projectName);
        const customPrompt = await loadActionPrompt(projectPaths.root, 'generate_image_hero');
        if (customPrompt) {
          flags.custom_prompt_template = customPrompt;
          this.logger.log('Loaded custom generate_image_hero prompt template');
        }

        // Load project's custom.md - pass empty string if not found
        const customContent = await loadActionCustomContent(projectPaths.root, 'generate_image_hero');
        flags.custom_prompt = customContent ?? '';
        if (customContent) {
          this.logger.log('Loaded project custom_prompt for generate_image_hero');
        }

        // Load custom variables for hero image generation
        const { loadActionConfig } = await import('./action-config-loader');
        const actionConfig = await loadActionConfig(projectPaths.root, 'generate_image_hero');
        if (actionConfig?.variables) {
          flags.custom_variables = actionConfig.variables;
          this.logger.log('Loaded custom generate_image_hero variables');
        }
      }

      // For enhance action with add_diagrams mode, load custom variables
      if (action === 'enhance' && flags.mode === 'add_diagrams') {
        const projectPaths = getProjectPaths(resolved.projectName);
        const { loadActionConfig } = await import('./action-config-loader');
        const actionConfig = await loadActionConfig(projectPaths.root, 'add_diagrams');
        if (actionConfig?.variables) {
          flags.custom_variables = actionConfig.variables;
          this.logger.log('Loaded custom add_diagrams variables');
        }
      }

      // For batch operations or status, include articles list
      if ((flags.all || action === 'status') && !resolved.isArticle) {
        const articles = await getArticles(resolved);
        context.articles = [];

        for (const articleItem of articles) {
          // Build unified article object with content
          const unifiedArticle: IArticle = {
            ...articleItem.meta,
            content: articleItem.content || '',
          };

          context.articles.push({
            path: articleItem.path,
            article: unifiedArticle,
          });
        }
      }

      // Read article if path includes article
      if (resolved.isArticle) {
        const articleData = await readArticleContent(resolved);
        if (articleData) {
          // Build unified article object with content
          context.article = {
            ...articleData.meta,
            content: articleData.articleContent || '',
          };
        }
      }
    } catch (err) {
      // Path resolution failed - let API handle validation
      this.logger.log(`Path resolution warning: ${err instanceof Error ? err.message : String(err)}`);
    }

    return context;
  }

  /**
   * Execute plan-import in chunks for large content plans
   * Splits plan by '---' separator and imports in batches with progress feedback
   */
  private async executeChunkedPlanImport(
    context: ActionContext,
    flags: Record<string, any>
  ): Promise<{
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
    tokensUsed?: number;
    costUsd?: number;
  }> {
    if (!context.planText) {
      return { success: false, error: 'No plan text provided' };
    }

    // Split plan into chunks by '---' separator
    const chunks = context.planText
      .split(/^---$/m)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    this.logger.log(`Plan has ${chunks.length} articles, splitting into batches...`);

    // Process in batches of 30 articles per API request
    const BATCH_SIZE = 30;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

    let totalImported = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const allErrors: Array<{ path: string; error: string }> = [];
    const allOperations: FileOperation[] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const batchText = batchChunks.join('\n---\n');

      this.logger.log(`Importing batch ${batchNum}/${totalBatches} (${batchChunks.length} articles)...`);

      try {
        const response = await this.client.post<ActionResponse>('/api/v1/cli/execute', {
          action: 'plan-import',
          flags,
          context: {
            ...context,
            planText: batchText,
          },
        });

        if (!response.success) {
          this.logger.log(`Batch ${batchNum} failed: ${response.error}`);
          allErrors.push({ path: `batch-${batchNum}`, error: response.error || 'Unknown error' });
          continue;
        }

        // Execute file operations for this batch
        for (const op of response.operations || []) {
          try {
            await this.executeOperation(op, context.projectName, response.prompt);
            allOperations.push(op);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logger.log(`Operation error: ${op.type} - ${errMsg}`);
            allErrors.push({ path: op.articlePath || 'unknown', error: errMsg });
          }
        }

        totalImported += response.batch?.processed || response.operations?.length || 0;
        totalTokens += response.tokensUsed || 0;
        totalCost += response.costUsd || 0;

        if (response.batch?.errors) {
          allErrors.push(...response.batch.errors);
        }

        this.logger.log(`Batch ${batchNum} done: ${response.batch?.processed || response.operations?.length || 0} articles`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.log(`Batch ${batchNum} error: ${errMsg}`);
        allErrors.push({ path: `batch-${batchNum}`, error: errMsg });
      }
    }

    const message = allErrors.length > 0
      ? `Imported ${totalImported}/${chunks.length} articles (${allErrors.length} errors)`
      : `Imported ${totalImported} articles from content plan`;

    return {
      success: totalImported > 0 || allErrors.length === 0,
      message,
      tokensUsed: totalTokens,
      costUsd: totalCost,
      data: {
        total: chunks.length,
        imported: totalImported,
        errors: allErrors,
      },
    };
  }

  /**
   * Execute a single file operation
   */
  private async executeOperation(op: FileOperation, contextProjectName?: string, prompt?: string): Promise<void> {
    const projectName = op.projectName || contextProjectName;

    if (!projectName && op.type !== 'create_project') {
      throw new Error('Project name required for operation');
    }

    switch (op.type) {
      case 'create_project': {
        if (!op.projectName || !op.projectConfig) {
          throw new Error('Project name and config required for create_project');
        }
        const paths = getProjectPaths(op.projectName);
        await initializeProjectDirectories(op.projectName);
        await saveProjectConfig(paths.root, op.projectConfig);
        this.logger.log(`Created project: ${op.projectName}`);
        break;
      }

      case 'create_article': {
        if (!op.articlePath || !op.article) {
          throw new Error('Article path and article required for create_article');
        }
        const paths = getProjectPaths(projectName!);
        // Extract content from unified article object
        const { content, ...meta } = op.article;
        await createArticleFolder(paths.content, op.articlePath, meta as IArticle, content || '');
        this.logger.log(`Created article: ${op.articlePath}`);
        break;
      }

      case 'update_article': {
        if (!op.articlePath || !op.article) {
          throw new Error('Article path and article required for update_article');
        }
        const paths = getProjectPaths(projectName!);
        const folderPath = path.join(paths.content, op.articlePath);

        // Extract content and meta from unified article object
        const { content, ...meta } = op.article;

        // Use saveArticleWithPipeline if article has last_pipeline
        if (op.article.last_pipeline) {
          // Combine pipeline + action name for history archive naming
          // e.g., "generate-fact_check" instead of just "generate"
          const archivePhase = op.action_name
            ? `${op.article.last_pipeline}-${op.action_name}`
            : op.article.last_pipeline;
          // Pass the full meta object so title, description, keywords from AI are saved
          // Also pass prompt for history tracking
          await saveArticleWithPipeline(
            folderPath,
            content || '',
            op.article.last_pipeline,
            archivePhase,
            meta as IArticle, // Pass meta (without content) for title, description, keywords, etc.
            prompt   // Pass prompt for history archive
          );
        } else if (op.article.last_action) {
          // Legacy: handle old last_action field
          const archivePhase = op.action_name
            ? `${op.article.last_action}-${op.action_name}`
            : op.article.last_action;
          await saveArticleWithPipeline(
            folderPath,
            content || '',
            op.article.last_action,
            archivePhase,
            meta as IArticle,
            prompt  // Pass prompt for history archive
          );
        } else {
          // Legacy fallback - deprecated, just update content
          const newStatus = op.article.status || 'draft';
          const fromStatus = op.article.status === 'draft' ? 'briefed' : 'draft';
          await saveArticle(folderPath, content || '', newStatus, fromStatus);
        }

        // Write index_failed.md if content extraction failed
        if (op.failedContent) {
          const { promises: fsPromises } = await import('fs');
          const failedPath = path.join(folderPath, 'index_failed.md');
          await fsPromises.writeFile(failedPath, op.failedContent, 'utf-8');
          this.logger.log(`Wrote failed extraction to: ${op.articlePath}/index_failed.md`);
        }

        this.logger.log(`Updated article: ${op.articlePath}`);
        break;
      }

      case 'update_meta': {
        if (!op.articlePath || !op.metaUpdates) {
          throw new Error('Article path and meta updates required for update_meta');
        }
        const paths = getProjectPaths(projectName!);
        const folderPath = path.join(paths.content, op.articlePath);
        await updateArticleMeta(folderPath, op.metaUpdates);
        this.logger.log(`Updated meta: ${op.articlePath}`);
        break;
      }

      default:
        throw new Error(`Unknown operation type: ${(op as any).type}`);
    }
  }

  /**
   * Write a generated file (e.g., rendered diagram) to the article folder
   */
  private async writeGeneratedFile(
    contentDir: string,
    articlePath: string,
    file: GeneratedFile
  ): Promise<void> {
    const { promises: fsPromises } = await import('fs');

    // Build full path: contentDir/articlePath/file.path
    const fullPath = path.join(contentDir, articlePath, file.path);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fsPromises.mkdir(dir, { recursive: true });

    // Decode base64 and write file
    const buffer = Buffer.from(file.content, 'base64');
    await fsPromises.writeFile(fullPath, buffer);
  }
}

// Export types for CLI usage
export type { ArticleFilter, PipelineInfo, PipelineConfig };
