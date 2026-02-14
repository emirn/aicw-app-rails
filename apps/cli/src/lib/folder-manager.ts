/**
 * Folder Manager for Filesystem-as-Plan Architecture
 *
 * Manages article folders in the content/ directory structure.
 * Each article is a folder containing:
 *   - index.json: Article metadata + content (unified format)
 *   - content.md: Content override file (optional, takes precedence)
 *   - _history/: Version history
 *
 * NOTE: This module only supports the unified format (index.json).
 * Use the 'migrate' command to convert old format (meta.json) to new format.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';
import {
  IArticle,
  IArticleFolder,
  IPlanSummary,
  IVersionEntry,
  INDEX_FILE,
  HISTORY_DIR,
} from '@blogpostgen/types';
import { UnifiedSerializer, isUnifiedFormat, isOldArticleFormat } from './unified-serializer';
import { PublishedRenderer } from '../utils/published-renderer';

/**
 * Error thrown when old format is detected
 */
export class LegacyFormatError extends Error {
  constructor(folderPath: string) {
    super(
      `Legacy format detected in "${folderPath}". ` +
      `Found meta.json instead of index.json. ` +
      `Run 'blogpostgen migrate' to convert to the new unified format.`
    );
    this.name = 'LegacyFormatError';
  }
}

/**
 * Check for legacy format and throw error if found
 */
async function assertUnifiedFormat(folderPath: string): Promise<void> {
  if (await isOldArticleFormat(folderPath)) {
    throw new LegacyFormatError(folderPath);
  }
}

/**
 * Scan content folder recursively for article folders
 * An article folder is identified by the presence of index.json
 *
 * @param contentDir - Absolute path to content/ directory
 * @returns Array of article folders with metadata and paths
 * @throws LegacyFormatError if old format (meta.json) is detected
 */
export async function scanContentFolder(contentDir: string): Promise<IArticleFolder[]> {
  const articles: IArticleFolder[] = [];

  async function scanDir(dir: string, relativePath: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return; // Directory doesn't exist yet
      }
      throw error;
    }

    // Check for legacy format first and throw error
    if (await isOldArticleFormat(dir)) {
      throw new LegacyFormatError(dir);
    }

    // Check if this is an article folder (has index.json)
    if (await isUnifiedFormat(dir)) {
      const serializer = new UnifiedSerializer<IArticle & { content?: string }>(dir);
      const { data } = await serializer.read();

      if (data) {
        const { content, ...meta } = data;
        articles.push({
          path: relativePath,
          meta: meta as IArticle,
          content: content,
          absolutePath: dir,
        });
      }
      // Don't recurse into article folders
      return;
    }

    // Recurse into subdirectories (skip hidden dirs)
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== HISTORY_DIR) {
        await scanDir(
          path.join(dir, entry.name),
          relativePath ? `${relativePath}/${entry.name}` : entry.name
        );
      }
    }
  }

  await scanDir(contentDir, '');
  return articles;
}

/**
 * Get article last_pipeline from metadata
 *
 * @param folderPath - Absolute path to article folder
 * @returns Article last_pipeline or null if seed article
 * @throws LegacyFormatError if old format is detected
 */
export async function getArticlePipeline(folderPath: string): Promise<string | null> {
  await assertUnifiedFormat(folderPath);

  if (!await isUnifiedFormat(folderPath)) {
    return null; // No article found
  }

  const serializer = new UnifiedSerializer<IArticle>(folderPath);
  const { data } = await serializer.read();
  return data?.last_pipeline ?? null;
}

/**
 * Get article metadata from folder
 *
 * @param folderPath - Absolute path to article folder
 * @returns Article metadata or null if not found
 */
export async function getArticleMeta(folderPath: string): Promise<IArticle | null> {
  if (!await isUnifiedFormat(folderPath)) {
    return null;
  }

  const serializer = new UnifiedSerializer<IArticle>(folderPath);
  const { data } = await serializer.read();
  return data ?? null;
}

/**
 * Create a new article folder with metadata and content
 * Uses unified format: index.json with content.md override
 *
 * @param contentDir - Absolute path to content/ directory
 * @param articlePath - Relative path for the article (e.g., "blog/tutorials/getting-started")
 * @param meta - Article metadata
 * @param briefContent - Initial content (saved as content.md override)
 */
export async function createArticleFolder(
  contentDir: string,
  articlePath: string,
  meta: IArticle,
  briefContent: string
): Promise<IArticleFolder> {
  const folderPath = path.join(contentDir, articlePath);

  // Create folder structure
  await fs.mkdir(folderPath, { recursive: true });

  // Use unified format: index.json + content.md
  const serializer = new UnifiedSerializer<IArticle & { content: string }>(folderPath);

  // Write unified data (UnifiedSerializer handles content.md creation)
  await serializer.write({
    ...meta,
    content: briefContent,
  });

  return {
    path: articlePath,
    meta,
    content: briefContent,
    absolutePath: folderPath,
  };
}

/**
 * Read article metadata from index.json
 *
 * @param folderPath - Absolute path to article folder
 * @returns Article metadata or null if not found
 * @throws LegacyFormatError if old format is detected
 */
export async function readArticleMeta(folderPath: string): Promise<IArticle | null> {
  await assertUnifiedFormat(folderPath);

  if (!await isUnifiedFormat(folderPath)) {
    return null;
  }

  const serializer = new UnifiedSerializer<IArticle & { content?: string }>(folderPath);
  const { data } = await serializer.read();
  if (data) {
    const { content, ...meta } = data;
    return meta as IArticle;
  }
  return null;
}

/**
 * Read article content from index.json (with content.md override support)
 *
 * @param folderPath - Absolute path to article folder
 * @returns Article content or null if not found
 * @throws LegacyFormatError if old format is detected
 */
export async function readArticle(folderPath: string): Promise<string | null> {
  await assertUnifiedFormat(folderPath);

  if (!await isUnifiedFormat(folderPath)) {
    return null;
  }

  const serializer = new UnifiedSerializer<{ content?: string }>(folderPath);
  const { data } = await serializer.read();
  return data?.content ?? null;
}

/**
 * Save article content and update metadata with new last_pipeline
 * Archives previous version to _history/ if content changed
 *
 * @param folderPath - Absolute path to article folder
 * @param content - New article content
 * @param newPipeline - New last_pipeline to set
 * @param archivePhase - Phase name for archive (e.g., "generate", "enhance")
 * @param metaUpdates - Optional additional meta fields to update (title, description, keywords from AI)
 * @param prompt - Optional AI prompt to archive for debugging
 * @throws LegacyFormatError if old format is detected
 */
export async function saveArticleWithPipeline(
  folderPath: string,
  content: string,
  newPipeline: string | null,
  archivePhase: string,
  metaUpdates?: Partial<IArticle>,
  prompt?: string
): Promise<void> {
  await assertUnifiedFormat(folderPath);

  const meta = await readArticleMeta(folderPath);
  if (!meta) {
    throw new Error(`Article metadata not found in ${folderPath}`);
  }

  // Archive current version if content exists
  const currentContent = await readArticle(folderPath);
  if (currentContent !== null) {
    const indexPath = path.join(folderPath, INDEX_FILE);
    const metaContent = await fs.readFile(indexPath, 'utf-8');
    await archiveVersion(folderPath, currentContent, metaContent, archivePhase, prompt);
  }

  // Build updated metadata
  const updatedMeta: IArticle = {
    ...meta,
    ...metaUpdates,
    // When newPipeline is null, preserve existing last_pipeline value
    last_pipeline: newPipeline !== null ? newPipeline : meta.last_pipeline,
    version: (meta.version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };

  // Write unified data (UnifiedSerializer handles content.md creation)
  const serializer = new UnifiedSerializer<IArticle & { content: string }>(folderPath);
  await serializer.write({
    ...updatedMeta,
    content,
  });
}

/**
 * Save article content (legacy function for backward compatibility)
 *
 * @deprecated Use saveArticleWithPipeline instead
 * @param folderPath - Absolute path to article folder
 * @param content - New content
 * @param _newStatus - Deprecated status parameter (ignored)
 * @param _fromStatus - Deprecated status parameter (ignored)
 */
export async function saveArticle(
  folderPath: string,
  content: string,
  _newStatus?: string,
  _fromStatus?: string
): Promise<void> {
  await assertUnifiedFormat(folderPath);

  const serializer = new UnifiedSerializer<IArticle & { content: string }>(folderPath);
  const { data: existing } = await serializer.read();

  if (!existing) {
    throw new Error(`Article not found in ${folderPath}`);
  }

  // Update content and timestamp (UnifiedSerializer handles content.md)
  await serializer.write({
    ...existing,
    content,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Save article with action tracking (legacy function for backward compatibility)
 *
 * @deprecated Use saveArticleWithPipeline instead
 * @param folderPath - Absolute path to article folder
 * @param content - New content
 * @param action - Action name (used for history archive)
 * @param prompt - Optional prompt for history
 */
export async function saveArticleWithAction(
  folderPath: string,
  content: string,
  action: string,
  prompt?: string
): Promise<void> {
  await assertUnifiedFormat(folderPath);

  const meta = await readArticleMeta(folderPath);
  if (!meta) {
    throw new Error(`Article metadata not found in ${folderPath}`);
  }

  // Archive current version
  const currentContent = await readArticle(folderPath);
  if (currentContent !== null) {
    const indexPath = path.join(folderPath, INDEX_FILE);
    const metaContent = await fs.readFile(indexPath, 'utf-8');
    await archiveVersion(folderPath, currentContent, metaContent, action, prompt);
  }

  // Write updated content
  // UnifiedSerializer handles content.md creation
  const serializer = new UnifiedSerializer<IArticle & { content: string }>(folderPath);
  await serializer.write({
    ...meta,
    content,
    version: (meta.version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Archive article state to _history/ folder before modification
 * Creates a timestamped subfolder containing all version files
 *
 * Structure: _history/{timestamp}-{action}/
 *   - index.json: Full article snapshot (metadata + content)
 *   - content.md: Content for easy viewing
 *   - prompt.md: AI prompt used (if provided)
 *
 * @param folderPath - Absolute path to article folder
 * @param content - Content to archive
 * @param metaContent - Metadata JSON content to archive
 * @param action - Action that was applied (e.g., "generate", "enhance")
 * @param prompt - Optional prompt sent to AI (for history/debugging)
 */
export async function archiveVersion(
  folderPath: string,
  content: string,
  metaContent: string,
  action: string,
  prompt?: string
): Promise<void> {
  const historyDir = path.join(folderPath, HISTORY_DIR);

  // ISO datetime with colons replaced for filesystem compatibility
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, 'Z');  // Remove milliseconds: 2025-12-27T14-30-00Z

  // Create timestamped subfolder: 2026-01-13T14-50-22Z-generate/
  const versionDir = path.join(historyDir, `${timestamp}-${action}`);
  await fs.mkdir(versionDir, { recursive: true });

  // Save files with consistent names inside subfolder
  await fs.writeFile(path.join(versionDir, 'index.json'), metaContent, 'utf-8');
  await fs.writeFile(path.join(versionDir, 'content.md'), content, 'utf-8');

  // Save prompt if provided (for debugging/auditing AI calls)
  if (prompt) {
    await fs.writeFile(path.join(versionDir, 'prompt.md'), prompt, 'utf-8');
  }
}

/**
 * Transition article to a new last_pipeline
 * Archives current content and updates metadata
 *
 * @param folderPath - Absolute path to article folder
 * @param newPipeline - New last_pipeline to set
 * @throws LegacyFormatError if old format is detected
 */
export async function transitionPipeline(
  folderPath: string,
  newPipeline: string
): Promise<void> {
  await assertUnifiedFormat(folderPath);

  const meta = await readArticleMeta(folderPath);
  if (!meta) {
    throw new Error(`Article metadata not found in ${folderPath}`);
  }

  const content = await readArticle(folderPath);
  if (content !== null) {
    const indexPath = path.join(folderPath, INDEX_FILE);
    const metaContent = await fs.readFile(indexPath, 'utf-8');
    await archiveVersion(folderPath, content, metaContent, meta.last_pipeline || 'seed');
  }

  // Build updated metadata
  const updatedMeta: IArticle = {
    ...meta,
    last_pipeline: newPipeline,
    version: (meta.version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };

  // Write unified data (UnifiedSerializer handles content.md if content exists)
  const serializer = new UnifiedSerializer<IArticle & { content?: string }>(folderPath);
  await serializer.write({
    ...updatedMeta,
    content: content ?? undefined,
  });
}

/**
 * Get version history for an article
 * Supports both formats:
 *   - New subfolder format: {datetime}-{action}/ (contains index.json, content.md, prompt.md)
 *   - Legacy flat format: {datetime}-{action}-{index|meta}.{md|json}
 *
 * @param folderPath - Absolute path to article folder
 * @returns Array of version entries (newest first)
 */
export async function getVersionHistory(folderPath: string): Promise<IVersionEntry[]> {
  const historyDir = path.join(folderPath, HISTORY_DIR);
  const entries: IVersionEntry[] = [];

  try {
    const items = await fs.readdir(historyDir, { withFileTypes: true });
    const fileSet = new Set(items.filter(i => i.isFile()).map(i => i.name));

    // Track seen datetime-action combos to avoid duplicates
    const seen = new Set<string>();

    for (const item of items) {
      // New subfolder format: {datetime}-{action}/
      if (item.isDirectory()) {
        const match = item.name.match(/^(\d{4}-\d{2}-\d{2}T[\d-]+Z)-(.+)$/);
        if (match) {
          const key = `${match[1]}-${match[2]}`;
          if (!seen.has(key)) {
            seen.add(key);
            // Restore ISO datetime by replacing hyphens back to colons in time part
            const datetime = match[1]
              .replace(/T(\d{2})-(\d{2})-(\d{2})Z/, 'T$1:$2:$3Z');
            entries.push({
              datetime,
              action: match[2],
              // For subfolder format, paths are relative to the subfolder
              indexFile: `${item.name}/content.md`,
              metaFile: `${item.name}/index.json`,
            });
          }
        }
        continue;
      }

      // Legacy flat file format: {datetime}-{action}-{type}.{md|json}
      const match = item.name.match(/^(\d{4}-\d{2}-\d{2}T[\d-]+Z)-(.+)-(index|meta)\.(md|json)$/);
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        if (!seen.has(key)) {
          seen.add(key);
          // Restore ISO datetime by replacing hyphens back to colons in time part
          const datetime = match[1]
            .replace(/T(\d{2})-(\d{2})-(\d{2})Z/, 'T$1:$2:$3Z');
          // Determine meta file extension (prefer .json)
          const metaJsonFile = `${match[1]}-${match[2]}-meta.json`;
          const metaMdFile = `${match[1]}-${match[2]}-meta.md`;
          const metaFile = fileSet.has(metaJsonFile) ? metaJsonFile : metaMdFile;
          entries.push({
            datetime,
            action: match[2],
            indexFile: `${match[1]}-${match[2]}-index.md`,
            metaFile,
          });
        }
      }
    }

    // Sort by datetime descending (newest first)
    entries.sort((a, b) => b.datetime.localeCompare(a.datetime));
  } catch {
    // No history directory
  }

  return entries;
}

/**
 * Check if an article folder exists (has index.json)
 *
 * @param contentDir - Absolute path to content/ directory
 * @param articlePath - Relative path for the article
 * @throws LegacyFormatError if old format is detected
 */
export async function articleFolderExists(
  contentDir: string,
  articlePath: string
): Promise<boolean> {
  const folderPath = path.join(contentDir, articlePath);

  // Check for legacy format and throw error
  await assertUnifiedFormat(folderPath);

  return isUnifiedFormat(folderPath);
}

/**
 * Get a summary of the content plan
 *
 * @param contentDir - Absolute path to content/ directory
 * @returns Plan summary with counts and article list
 */
export async function getPlanSummary(contentDir: string): Promise<IPlanSummary> {
  const articles = await scanContentFolder(contentDir);

  const byStatus: Record<string, number> = {
    briefed: 0,
    draft: 0,
    reviewed: 0,
    enriched: 0,
    final: 0,
  };

  const articleList = articles.map((a) => {
    const status = (a.meta as any).status || 'briefed';
    if (byStatus[status] !== undefined) {
      byStatus[status]++;
    }
    return {
      path: a.path,
      title: a.meta.title,
      status,
    };
  });

  return {
    total: articles.length,
    byStatus: byStatus as any,
    articles: articleList as any,
  };
}

/**
 * Delete an article folder
 *
 * @param contentDir - Absolute path to content/ directory
 * @param articlePath - Relative path for the article
 */
export async function deleteArticleFolder(
  contentDir: string,
  articlePath: string
): Promise<void> {
  const folderPath = path.join(contentDir, articlePath);
  await fs.rm(folderPath, { recursive: true, force: true });
}

/**
 * Get articles by last_pipeline
 * Use null to get seed articles (no last_pipeline set)
 *
 * @param contentDir - Absolute path to content/ directory
 * @param pipelines - Array of pipelines to filter by (use null for seed articles)
 */
export async function getArticlesByPipeline(
  contentDir: string,
  pipelines: (string | null)[]
): Promise<IArticleFolder[]> {
  const articles = await scanContentFolder(contentDir);
  return articles.filter((a) => {
    const pipeline = a.meta.last_pipeline ?? null;
    return pipelines.includes(pipeline);
  });
}

/**
 * Update article metadata (partial update)
 *
 * @param folderPath - Absolute path to article folder
 * @param updates - Partial metadata to update
 * @throws LegacyFormatError if old format is detected
 */
export async function updateArticleMeta(
  folderPath: string,
  updates: Partial<IArticle>
): Promise<IArticle> {
  await assertUnifiedFormat(folderPath);

  const meta = await readArticleMeta(folderPath);
  if (!meta) {
    throw new Error(`Article metadata not found in ${folderPath}`);
  }

  const updatedMeta: IArticle = {
    ...meta,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  // Write unified data (UnifiedSerializer handles content.md if content exists)
  const content = await readArticle(folderPath);
  const serializer = new UnifiedSerializer<IArticle & { content?: string }>(folderPath);
  await serializer.write({
    ...updatedMeta,
    content: content ?? undefined,
  });

  return updatedMeta;
}

/**
 * Add an action to applied_actions in article meta
 * Safely handles duplicates via Set
 *
 * @param folderPath - Absolute path to article folder
 * @param actionName - Name of the action to add
 */
export async function addAppliedAction(
  folderPath: string,
  actionName: string
): Promise<void> {
  const meta = await readArticleMeta(folderPath);
  if (!meta) return;

  const currentActions = meta.applied_actions || [];
  const newActions = [...new Set([...currentActions, actionName])];

  // Only update if actually changed
  if (newActions.length > currentActions.length) {
    await updateArticleMeta(folderPath, { applied_actions: newActions });
  }
}

/**
 * Add a cost entry to an article's costs array
 *
 * @param folderPath - Absolute path to article folder
 * @param action - Name of the action (e.g., "write_draft", "fact_check")
 * @param cost - Cost in USD (0 for no-AI actions)
 */
export async function addCostEntry(
  folderPath: string,
  action: string,
  cost: number
): Promise<void> {
  const meta = await readArticleMeta(folderPath);
  if (!meta) return;

  const costs = meta.costs || [];
  costs.push({
    created_at: new Date().toISOString(),
    action,
    cost,
  });

  await updateArticleMeta(folderPath, { costs });
}

/**
 * Get the URL path for an article (based on folder structure)
 *
 * @param articlePath - Relative path from drafts/ (e.g., "blog/tutorials/getting-started")
 * @returns URL path (e.g., "/blog/tutorials/getting-started")
 */
export function getUrlPath(articlePath: string): string {
  return '/' + articlePath.replace(/\\/g, '/');
}

/**
 * Build result for published articles
 */
export interface BuildPublishedResult {
  total: number;
  success: number;
  assetsCopied: number;
  assetsSkipped: number;
}

/**
 * Build published articles from drafts/ folder
 *
 * This is a "build" command that:
 * 1. Scans drafts/ for publishable articles (matching publishableFilter regex)
 * 2. Validates all articles (preflight check)
 * 3. Cleans the published/ folder
 * 4. Renders all publishable articles to published/ using templates
 * 5. Copies article-local assets to published-assets/
 *
 * @param projectDir - Absolute path to project root
 * @param draftsDir - Absolute path to drafts/ folder
 * @param publishedDir - Absolute path to published/ folder
 * @param logger - Optional logger for progress output
 * @param publishableFilter - Optional regex pattern for filtering publishable articles (default: "^enhance")
 */
export async function buildPublished(
  projectDir: string,
  draftsDir: string,
  publishedDir: string,
  logger?: { log: (msg: string) => void },
  publishableFilter?: string
): Promise<BuildPublishedResult> {
  const log = logger ? (msg: string) => logger.log(msg) : () => {};

  // === PREFLIGHT: Check required folders ===
  log('Preflight: Checking project structure...');

  if (!existsSync(draftsDir)) {
    throw new Error(`Preflight failed: /drafts/ folder is missing at ${draftsDir}.`);
  }

  // === SCAN: Get publishable articles from drafts/ ===
  log('Scanning drafts/ folder for publishable articles...');
  const allArticles = await scanContentFolder(draftsDir);

  // Use regex if provided, fallback to default
  const pattern = publishableFilter
    ? new RegExp(publishableFilter)
    : /^enhance/;

  // Filter for publishable articles using regex pattern
  const articles = allArticles.filter(a => {
    const pipeline = a.meta.last_pipeline;
    return pipeline ? pattern.test(pipeline) : false;
  });

  if (articles.length === 0) {
    throw new Error(`Preflight failed: No publishable articles found (need last_pipeline matching "${publishableFilter || '^enhance'}")`);
  }

  log(`Found ${articles.length} article(s) to publish`);

  // === PREFLIGHT: Validate all articles ===
  log('Preflight: Validating all articles...');

  for (const article of articles) {
    const errors: string[] = [];

    if (!article.meta.title?.trim()) {
      errors.push('title is empty');
    }
    if (!article.meta.description?.trim()) {
      errors.push('description is empty');
    }
    if (!article.meta.keywords || article.meta.keywords.length === 0) {
      errors.push('keywords is empty');
    }
    if (!article.meta.published_at?.trim()) {
      errors.push('published_at is empty (run migrate-published-at to backfill)');
    }

    if (errors.length > 0) {
      throw new Error(
        `Preflight failed for "${article.path}": ${errors.join(', ')}`
      );
    }
  }

  log('Preflight: All articles validated successfully');

  // === CLEAN: Wipe published/ folder ===
  log('Cleaning published/ folder...');

  if (existsSync(publishedDir)) {
    await fs.rm(publishedDir, { recursive: true, force: true });
  }
  await fs.mkdir(publishedDir, { recursive: true });

  // === BUILD: Convert each article ===
  log('Building published articles...');

  const renderer = new PublishedRenderer(projectDir);
  await renderer.initialize();

  for (const article of articles) {
    log(`  Publishing: ${article.path}`);

    const articleData: Record<string, any> = {
      ...article.meta,
      content: article.content || '',
    };

    const rendered = await renderer.render(articleData);

    // Output path: published/{articlePath}.md (single file, not folder)
    const outputPath = path.join(publishedDir, `${article.path}.md`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, rendered, 'utf-8');
  }

  log(`Built ${articles.length} article(s)`);

  // === ASSETS: Merge article-local assets into published-assets/ ===
  // Each article's assets/ folder mirrors the website /assets/ structure
  // e.g., ready/blog/my-post/assets/blog/my-post/hero.png -> published-assets/blog/my-post/hero.png
  // Note: published-assets/ is at project root (sibling to published/), not inside published/
  log('Merging article assets...');

  const publishedAssetsDir = path.join(projectDir, 'published-assets');
  await fs.mkdir(publishedAssetsDir, { recursive: true });

  let assetsCopied = 0;

  for (const article of articles) {
    const articleAssetsDir = path.join(article.absolutePath, 'assets');

    if (!existsSync(articleAssetsDir)) {
      continue; // No assets for this article
    }

    // Recursively copy article's assets/ to published/assets/
    // Since article assets/ already has full path structure, just merge
    const assetFiles = await getAllFiles(articleAssetsDir);

    for (const assetPath of assetFiles) {
      const relativePath = path.relative(articleAssetsDir, assetPath);
      const destPath = path.join(publishedAssetsDir, relativePath);

      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(assetPath, destPath);
      assetsCopied++;
    }

    if (assetFiles.length > 0) {
      log(`  Merged ${assetFiles.length} asset(s) from ${article.path}`);
    }
  }

  log(`Published: ${articles.length} article(s), ${assetsCopied} asset(s)`);

  return {
    total: articles.length,
    success: articles.length,
    assetsCopied,
    assetsSkipped: 0,
  };
}

/**
 * Get all files in a directory recursively
 */
async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}
