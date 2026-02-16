/**
 * Plan Importer
 *
 * Imports content plans from simple text format and creates the
 * folder structure for the Filesystem-as-Plan architecture.
 *
 * Format: TITLE:/URL:/KEYWORDS:/DESCRIPTION: fields separated by ---
 */

import { promises as fs } from 'fs';
import path from 'path';
import {
  IArticle,
  IPlanImportResult,
  IContentPlan,
  IContentPlanItem,
  ContentPlan,
  ContentPlanItem,
  IImportPreviewItem,
  ImportConflictType,
  META_FILE,
} from '@blogpostgen/types';
import {
  createArticleFolder,
  articleFolderExists,
  readArticleMeta,
  readArticle,
  archiveVersion,
} from './folder-manager';
import { getContentDir } from './project-config';
import { simplePlanToPlan, SimplePlanParseResult } from './simple-plan-parser';

/**
 * Stopwords to filter from paths for cleaner, shorter URLs.
 * Based on SEO best practices (2025-2026): 3-5 words optimal.
 */
const STOPWORDS_FOR_PATHS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'by', 'for', 'with',
  'at', 'in', 'to', 'on', 'as', 'is', 'it', 'how', 'what', 'why', 'when',
  'where', 'which', 'who', 'your', 'my', 'our', 'their', 'this', 'that'
]);

/**
 * Generate a clean, SEO-friendly path from a title.
 * - Removes stopwords for shorter URLs
 * - Limits to maxWords (default 5) for optimal SEO
 * - Uses hyphens between words
 *
 * Examples:
 *   "How to Detect Article Created by AI" → "detect-article-created-ai"
 *   "The Best AI Tools for Content Creation" → "best-ai-tools-content-creation"
 */
function pathify(title: string, maxWords: number = 5): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const words = normalized.split(/\s+/)
    .filter(word => word.length >= 2 && !STOPWORDS_FOR_PATHS.has(word))
    .slice(0, maxWords);
  return words.join('-') || 'article';
}

/**
 * Parse plan file content using simple text format
 * Format: TITLE:/URL:/DATE:/KEYWORDS:/DESCRIPTION: fields separated by ---
 *
 * @param filePath - Path to plan file
 * @returns Parse result with plan, counts, and warnings
 */
export async function parsePlanFile(filePath: string): Promise<SimplePlanParseResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  return simplePlanToPlan(content, filePath);
}

/**
 * Print summary of plan parsing results
 * Shows parsed/skipped counts, warnings, and file paths
 */
export function printParseSummary(
  result: SimplePlanParseResult,
  draftsDir: string
): void {
  console.log(`\n✅ Parsed: ${result.parsed} articles`);

  if (result.skipped > 0) {
    console.log(`⚠️  Skipped: ${result.skipped} blocks (missing required fields)`);
    for (const w of result.warnings) {
      console.log(`   - Block ${w.blockIndex}: ${w.reason}`);
    }
  }

  console.log(`📁 Drafts created in: ${draftsDir}`);
  if (result.sourceFile) {
    console.log(`📄 Source plan: ${result.sourceFile}`);
  }
}

/**
 * Analyze plan items and detect conflicts BEFORE importing
 * Returns preview of what will happen for each item
 */
export async function analyzeImport(
  projectDir: string,
  plan: IContentPlan | ContentPlan,
  defaultPath?: string
): Promise<IImportPreviewItem[]> {
  const contentDir = getContentDir(projectDir);
  const preview: IImportPreviewItem[] = [];

  for (const item of plan.items) {
    const { path: articlePath } = planItemToArticleMeta(item, defaultPath || '');
    const folderPath = path.join(contentDir, articlePath);

    let conflict: ImportConflictType = 'new';
    let existingPipeline: string | undefined;

    if (await articleFolderExists(contentDir, articlePath)) {
      const meta = await readArticleMeta(folderPath);
      if (meta?.last_pipeline) {
        conflict = 'skip';
        existingPipeline = meta.last_pipeline;
      } else {
        conflict = 'seed_replace';
      }
    }

    preview.push({
      title: item.title,
      path: item.path,
      articlePath,
      conflict,
      existingPipeline,
    });
  }

  return preview;
}

/**
 * Display import preview with conflict indicators
 */
export function displayImportPreview(preview: IImportPreviewItem[]): void {
  console.log('\n=== Import Preview ===\n');

  for (const item of preview) {
    const symbol =
      item.conflict === 'new'
        ? '+'
        : item.conflict === 'seed_replace'
          ? '~'
          : 'X';

    console.log(`  [${symbol}] ${item.title}`);
    console.log(`      → ${item.articlePath}`);

    if (item.conflict === 'seed_replace') {
      console.log(`      ⚠️  Exists: seed article (will prompt for new URL)`);
    } else if (item.conflict === 'skip') {
      console.log(`      ❌ Exists: at '${item.existingPipeline}' stage (will prompt for new URL)`);
    }
  }

  // Summary
  const counts = {
    new: preview.filter((p) => p.conflict === 'new').length,
    conflict: preview.filter((p) => p.conflict !== 'new').length,
  };

  console.log('');
  if (counts.conflict > 0) {
    console.log(`Summary: ${counts.new} new, ${counts.conflict} conflict(s) to resolve`);
  } else {
    console.log(`Summary: ${counts.new} new article(s)`);
  }
}

/**
 * Execute import with resolved conflicts
 * Uses the resolved map to determine final paths
 */
export async function executeResolvedImport(
  projectDir: string,
  plan: IContentPlan | ContentPlan,
  preview: IImportPreviewItem[],
  resolved: Map<string, string | 'skip' | 'fail'>,
  options: {
    defaultPath?: string;
    websiteInfo?: { title?: string; audience?: string; brand_voice?: string };
  } = {}
): Promise<IPlanImportResultExtended & { failed: number; failures: Array<{ path: string; reason: string }> }> {
  const contentDir = getContentDir(projectDir);
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    createdPaths: [] as string[],
    updatedPaths: [] as string[],
    skippedPaths: [] as string[],
    skippedReasons: [] as Array<{ path: string; reason: string }>,
    failures: [] as Array<{ path: string; reason: string }>,
    errors: [] as Array<{ path: string; error: string }>,
  };

  const { websiteInfo } = options;

  // Merge website info from plan if not provided
  const planWebsite = plan.website as {
    url: string;
    title: string;
    focus_keywords?: string;
    audience?: string;
    positioning?: string;
  };

  const mergedWebsiteInfo = {
    title: websiteInfo?.title || planWebsite.title,
    audience: websiteInfo?.audience || planWebsite.audience,
    brand_voice: websiteInfo?.brand_voice,
  };

  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    const previewItem = preview[i];

    // Check if this item has a resolution
    const resolution = resolved.get(previewItem.articlePath);

    // Determine final path
    let finalPath: string;
    if (resolution === 'skip') {
      result.skipped++;
      result.skippedPaths.push(previewItem.articlePath);
      result.skippedReasons.push({
        path: previewItem.articlePath,
        reason: 'user skipped',
      });
      continue;
    } else if (resolution === 'fail') {
      result.failed++;
      result.failures.push({
        path: previewItem.articlePath,
        reason:
          previewItem.conflict === 'skip'
            ? `URL already exists (at '${previewItem.existingPipeline}' stage)`
            : 'URL already exists',
      });
      continue;
    } else if (typeof resolution === 'string') {
      // User provided a new path
      finalPath = resolution;
    } else {
      // No conflict or no resolution needed
      finalPath = previewItem.articlePath;
    }

    try {
      // Create meta with potentially different path
      const { meta } = planItemToArticleMeta(item, options.defaultPath || '');

      // Generate brief content and create
      const briefContent = generateBriefContent(item, mergedWebsiteInfo);
      await createArticleFolder(contentDir, finalPath, meta, briefContent);

      result.created++;
      result.createdPaths.push(finalPath);
    } catch (error) {
      result.errors.push({
        path: finalPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * Convert a plan item to article metadata
 */
export function planItemToArticleMeta(
  item: IContentPlanItem | ContentPlanItem,
  defaultPath: string = 'blog'
): { meta: IArticle; path: string } {
  const now = new Date().toISOString();

  // Determine path: use item path, potentially with a default prefix
  // If path contains slashes, treat as full path
  let articlePath: string;
  if (item.path.includes('/')) {
    articlePath = item.path;
  } else {
    articlePath = `${defaultPath}/${item.path}`;
  }

  // Get publish date from plan item (ContentPlanItem has date field)
  const planDate = (item as ContentPlanItem).date;

  const meta: IArticle = {
    title: item.title,
    content: item.description,  // plan description = article brief/assignment
    keywords: item.target_keywords || [],
    // No last_pipeline = seed article (ready for generate pipeline)
    internal_links: (item as IContentPlanItem).link_recommendations?.map((l) => ({
      path: l.path,
      anchor: l.anchor_text,
    })),
    // Transfer publish date from plan item (ContentPlanItem has date field)
    published_at: planDate, // New field for scheduling
    version: 0,
    created_at: now,
    updated_at: now,
  };

  return { meta, path: articlePath };
}

/**
 * Generate brief content (content.md) from plan item
 */
export function generateBriefContent(
  item: IContentPlanItem | ContentPlanItem,
  websiteInfo?: { title?: string; audience?: string; brand_voice?: string }
): string {
  const lines: string[] = [];

  lines.push(`# ${item.title}`);
  lines.push('');
  lines.push(item.description);
  lines.push('');

  lines.push('## Target Audience');
  lines.push(websiteInfo?.audience || 'General audience');
  lines.push('');

  lines.push('## Must Cover');
  lines.push('<!-- Add specific topics that MUST be included -->');
  if (item.target_keywords && item.target_keywords.length > 0) {
    for (const keyword of item.target_keywords) {
      lines.push(`- ${keyword}`);
    }
  }
  lines.push('');

  lines.push('## Examples to Include');
  lines.push('<!-- Add real-world examples, case studies, or data -->');
  lines.push('');

  lines.push('## Notes');
  lines.push('<!-- Add any additional notes or requirements -->');
  if (websiteInfo?.brand_voice) {
    lines.push(`- Tone: ${websiteInfo.brand_voice}`);
  }
  if ((item as IContentPlanItem).notes) {
    lines.push(`- ${(item as IContentPlanItem).notes}`);
  }
  lines.push('');

  // Add metadata summary as comment
  lines.push('<!--');
  lines.push('--- Article Metadata ---');
  lines.push(`Target Words: ${item.target_words || 2000}`);
  lines.push(`Search Intent: ${item.search_intent || 'informational'}`);
  lines.push(`Funnel Stage: ${item.funnel_stage || 'top'}`);
  lines.push(`Priority: ${item.priority || 2}`);
  if (item.target_keywords && item.target_keywords.length > 0) {
    lines.push(`Keywords: ${item.target_keywords.join(', ')}`);
  }
  lines.push('-->');

  return lines.join('\n');
}

/**
 * Extended import result with updated count
 */
export interface IPlanImportResultExtended extends IPlanImportResult {
  updated: number;
  updatedPaths: string[];
  skippedReasons: Array<{ path: string; reason: string }>;
}

/**
 * Import a content plan and create folder structure
 *
 * Handles existing articles:
 * - If last_pipeline is null/undefined (seed stage): Archive old version and replace
 * - If last_pipeline is set (past generate): Skip and warn
 *
 * @param projectDir - Absolute path to project root
 * @param plan - Content plan to import
 * @param options - Import options
 * @returns Import result with created/updated/skipped counts
 */
export async function importPlan(
  projectDir: string,
  plan: IContentPlan | ContentPlan,
  options: {
    defaultPath?: string;
    websiteInfo?: { title?: string; audience?: string; brand_voice?: string };
  } = {}
): Promise<IPlanImportResultExtended> {
  const contentDir = getContentDir(projectDir);
  const result: IPlanImportResultExtended = {
    created: 0,
    updated: 0,
    skipped: 0,
    createdPaths: [],
    updatedPaths: [],
    skippedPaths: [],
    skippedReasons: [],
    errors: [],
  };

  const { defaultPath = '', websiteInfo } = options;

  // Merge website info from plan if not provided
  const planWebsite = plan.website as {
    url: string;
    title: string;
    focus_keywords?: string;
    audience?: string;
    positioning?: string;
  };

  const mergedWebsiteInfo = {
    title: websiteInfo?.title || planWebsite.title,
    audience: websiteInfo?.audience || planWebsite.audience,
    brand_voice: websiteInfo?.brand_voice,
  };

  for (const item of plan.items) {
    try {
      const { meta, path: articlePath } = planItemToArticleMeta(item, defaultPath);
      const folderPath = path.join(contentDir, articlePath);

      // Check if article already exists
      if (await articleFolderExists(contentDir, articlePath)) {
        const existingMeta = await readArticleMeta(folderPath);

        // If past seed stage (last_pipeline is set) - SKIP
        if (existingMeta?.last_pipeline) {
          result.skipped++;
          result.skippedPaths.push(articlePath);
          result.skippedReasons.push({
            path: articlePath,
            reason: `already at '${existingMeta.last_pipeline}' stage`,
          });
          continue;
        }

        // At seed stage - archive old version and replace
        try {
          const oldContent = await readArticle(folderPath) || '';
          const oldMeta = await fs.readFile(path.join(folderPath, META_FILE), 'utf-8');
          await archiveVersion(folderPath, oldContent, oldMeta, 'plan-import-replaced');
        } catch {
          // Old files may not exist, that's ok
        }

        // Generate brief content and update
        const briefContent = generateBriefContent(item, mergedWebsiteInfo);
        await createArticleFolder(contentDir, articlePath, meta, briefContent);

        result.updated++;
        result.updatedPaths.push(articlePath);
      } else {
        // New article - create it
        const briefContent = generateBriefContent(item, mergedWebsiteInfo);
        await createArticleFolder(contentDir, articlePath, meta, briefContent);

        result.created++;
        result.createdPaths.push(articlePath);
      }
    } catch (error) {
      result.errors.push({
        path: item.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Print warning if any skipped due to being past seed stage
  if (result.skippedReasons.length > 0) {
    console.warn('\n⚠️  Skipped articles (already past seed stage):');
    for (const s of result.skippedReasons) {
      console.warn(`   - ${s.path}: ${s.reason}`);
    }
  }

  return result;
}

/**
 * Extended result including parse info
 */
export interface IPlanImportFromFileResult extends IPlanImportResultExtended {
  parseResult: SimplePlanParseResult;
}

/**
 * Import a plan from a file
 *
 * @param projectDir - Absolute path to project root
 * @param planFilePath - Path to plan file
 * @param options - Import options
 */
export async function importPlanFromFile(
  projectDir: string,
  planFilePath: string,
  options: {
    defaultPath?: string;
    skipExisting?: boolean;
    websiteInfo?: { title?: string; audience?: string; brand_voice?: string };
  } = {}
): Promise<IPlanImportFromFileResult> {
  const parseResult = await parsePlanFile(planFilePath);
  const importResult = await importPlan(projectDir, parseResult.plan, options);
  return {
    ...importResult,
    parseResult,
  };
}

/**
 * Import a plan from content string (for terminal paste input)
 *
 * @param projectDir - Absolute path to project root
 * @param content - Content plan text
 * @param sourceName - Name to display as source (default: 'terminal input')
 * @param options - Import options
 */
export async function importPlanFromContent(
  projectDir: string,
  content: string,
  sourceName: string = 'terminal input',
  options: {
    defaultPath?: string;
    websiteInfo?: { title?: string; audience?: string; brand_voice?: string };
  } = {}
): Promise<IPlanImportFromFileResult> {
  const parseResult = simplePlanToPlan(content, sourceName);
  const importResult = await importPlan(projectDir, parseResult.plan, options);
  return {
    ...importResult,
    parseResult,
  };
}

/**
 * Create a plan item from user ideas
 * (Used when user provides --ideas flag)
 */
export function ideaToContentPlanItem(
  idea: string,
  index: number
): ContentPlanItem {
  // Generate SEO-optimized path from idea (removes stopwords, limits to 5 words)
  const articlePath = pathify(idea);

  return {
    id: `idea-${index + 1}`,
    path: articlePath,
    title: idea,
    description: idea,
    target_keywords: [],
    target_words: 2000,
    search_intent: 'informational',
    funnel_stage: 'top',
    priority: 2,
  };
}

/**
 * Parse ideas string (pipe-separated) into content plan items
 */
export function parseIdeas(ideasString: string): ContentPlanItem[] {
  return ideasString
    .split('|')
    .map((idea) => idea.trim())
    .filter((idea) => idea.length > 0)
    .map((idea, index) => ideaToContentPlanItem(idea, index));
}

/**
 * Create a minimal content plan from ideas
 */
export function createPlanFromIdeas(
  websiteUrl: string,
  websiteTitle: string,
  ideas: ContentPlanItem[]
): ContentPlan {
  return {
    website: {
      url: websiteUrl,
      title: websiteTitle,
    },
    total_articles: ideas.length,
    items: ideas,
  };
}
