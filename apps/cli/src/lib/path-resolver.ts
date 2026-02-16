/**
 * Path Resolver for CLI
 *
 * Resolves project and article paths, and reads content for API requests.
 * Supports both relative paths (project-name/article-path) and absolute paths.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';
import { USER_PROJECTS_DIR, getProjectPaths } from '../config/user-paths';
import { readArticle, readArticleMeta, scanContentFolder } from './folder-manager';
import { loadProjectConfig } from './project-config';
import { IArticle, IArticleFolder, IProjectConfig, META_FILE } from '@blogpostgen/types';

/**
 * Resolved path info
 */
export interface ResolvedPath {
  projectName: string;
  articlePath?: string;
  projectDir: string;
  contentDir: string;
  isProject: boolean;
  isArticle: boolean;
}

/**
 * Article content for API requests
 */
export interface ArticleContent {
  articleContent: string;
  metaContent: string;
  meta: IArticle;
  folderPath: string;
}

/**
 * Resolve a CLI path argument to project/article info
 *
 * Supported formats:
 * - "project-name" - Just the project
 * - "project-name/blog/article-path" - Project + article path
 * - "/full/path/to/project/content/blog/article-path" - Full path
 * - "~/Library/.../projects/project-name/content/..." - Home-relative path
 *
 * @param inputPath - Path from CLI argument
 * @returns Resolved path info
 */
export function resolvePath(inputPath: string): ResolvedPath {
  // Handle home directory shorthand
  let cleanPath = inputPath;
  if (cleanPath.startsWith('~/')) {
    cleanPath = path.join(process.env.HOME || '', cleanPath.slice(2));
  }

  // Check if it's an absolute path within the projects directory
  if (path.isAbsolute(cleanPath)) {
    return resolveAbsolutePath(cleanPath);
  }

  // Otherwise, treat as relative path: projectName[/articlePath]
  return resolveRelativePath(cleanPath);
}

/**
 * Resolve an absolute path
 */
function resolveAbsolutePath(absPath: string): ResolvedPath {
  // Check if path is within USER_PROJECTS_DIR
  const relativeToProjects = path.relative(USER_PROJECTS_DIR, absPath);

  if (relativeToProjects.startsWith('..')) {
    // Path is outside USER_PROJECTS_DIR
    throw new Error(`Path is not within projects directory: ${absPath}`);
  }

  // Parse the relative path
  const parts = relativeToProjects.split(path.sep);
  const projectName = parts[0];

  // Check if path goes into content directory
  const contentIdx = parts.indexOf('content');
  let articlePath: string | undefined;

  if (contentIdx >= 0 && contentIdx < parts.length - 1) {
    // Path includes content/... so extract article path
    articlePath = parts.slice(contentIdx + 1).join('/');
  }

  const paths = getProjectPaths(projectName);

  return {
    projectName,
    articlePath,
    projectDir: paths.root,
    contentDir: paths.content,
    isProject: !articlePath,
    isArticle: !!articlePath,
  };
}

/**
 * Resolve a relative path (project-name/article-path)
 */
function resolveRelativePath(relPath: string): ResolvedPath {
  const parts = relPath.split('/').filter(Boolean);

  if (parts.length === 0) {
    throw new Error('Empty path provided');
  }

  const projectName = parts[0];
  const paths = getProjectPaths(projectName);

  const articlePath = parts.length > 1 ? parts.slice(1).join('/') : undefined;

  return {
    projectName,
    articlePath,
    projectDir: paths.root,
    contentDir: paths.content,
    isProject: !articlePath,
    isArticle: !!articlePath,
  };
}

/**
 * Check if a project exists
 */
export async function projectExists(resolved: ResolvedPath): Promise<boolean> {
  // A project exists if its directory exists (subfolders in /projects/ are projects)
  return existsSync(resolved.projectDir);
}

/**
 * Check if an article exists
 */
export async function articleExists(resolved: ResolvedPath): Promise<boolean> {
  if (!resolved.articlePath) return false;
  const metaPath = path.join(resolved.contentDir, resolved.articlePath, META_FILE);
  return existsSync(metaPath);
}

/**
 * Read article content for API request
 */
export async function readArticleContent(resolved: ResolvedPath): Promise<ArticleContent | null> {
  if (!resolved.articlePath) return null;

  const folderPath = path.join(resolved.contentDir, resolved.articlePath);
  const meta = await readArticleMeta(folderPath);
  if (!meta) return null;

  const content = await readArticle(folderPath);
  if (!content) return null;

  // Read raw meta file for API
  const metaPath = path.join(folderPath, META_FILE);
  let metaContent = '';
  try {
    metaContent = await fs.readFile(metaPath, 'utf-8');
  } catch {
    // Use empty string if can't read
  }

  return {
    articleContent: content,
    metaContent,
    meta,
    folderPath,
  };
}

/**
 * Get project configuration
 */
export async function getProjectConfig(resolved: ResolvedPath): Promise<IProjectConfig | null> {
  return loadProjectConfig(resolved.projectDir);
}

/**
 * Get all articles in a project matching a last_pipeline filter
 * Use null to get seed articles (no last_pipeline set)
 */
export async function getArticles(
  resolved: ResolvedPath,
  pipelineFilter?: (string | null)[]
): Promise<IArticleFolder[]> {
  const articles = await scanContentFolder(resolved.contentDir);

  if (!pipelineFilter || pipelineFilter.length === 0) {
    return articles;
  }

  return articles.filter((a) => {
    const pipeline = a.meta.last_pipeline ?? null;
    return pipelineFilter.includes(pipeline);
  });
}

/**
 * Get seed articles - articles that have not been through any pipeline yet.
 *
 * A "seed article" is created by:
 * - article-seed command (single article, local CLI action)
 * - plan-import command (batch from content plan, API action)
 *
 * Seed articles have: last_pipeline === null (or missing)
 * After generate pipeline: last_pipeline === 'generate'
 * After enhance pipeline: last_pipeline === 'enhance'
 *
 * @param resolved - Resolved path to project or article
 * @returns Array of seed articles ready for generation
 */
export async function getSeedArticles(resolved: ResolvedPath): Promise<IArticleFolder[]> {
  return getArticles(resolved, [null]);
}

/**
 * Get articles that completed a specific pipeline
 */
export async function getArticlesAfterPipeline(
  resolved: ResolvedPath,
  pipeline: string
): Promise<IArticleFolder[]> {
  return getArticles(resolved, [pipeline]);
}

/**
 * Get publishable articles from the drafts/ folder.
 * Uses regex pattern from config (default: articles with last_pipeline starting with 'enhance').
 *
 * @param projectName - Name of the project
 * @param publishableFilter - Optional regex pattern from config (e.g., "^enhance.*")
 */
export async function getPublishableArticles(
  projectName: string,
  publishableFilter?: string
): Promise<IArticleFolder[]> {
  const paths = getProjectPaths(projectName);
  const allArticles = await scanContentFolder(paths.drafts);

  // Use regex if provided, fallback to default
  const pattern = publishableFilter
    ? new RegExp(publishableFilter)
    : /^enhance/;

  return allArticles.filter(a => {
    const pipeline = a.meta.last_pipeline;
    return pipeline ? pattern.test(pipeline) : false;
  });
}

/**
 * Build website info from project config
 */
export function buildWebsiteInfo(config: IProjectConfig): Record<string, any> {
  return {
    url: config.url,
    title: config.title,
  };
}

/**
 * Extract project name from URL
 */
export function projectNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url.includes('://') ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '-');
  } catch {
    return url.replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  }
}
