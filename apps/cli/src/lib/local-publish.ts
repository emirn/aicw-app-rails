/**
 * Local Folder Publishing
 *
 * Copies published articles and assets to a configured local folder
 * (e.g., an Astro site's src/content/blog/ directory).
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { ILocalPublishConfig, IProjectConfig } from '@blogpostgen/types';
import { Logger } from '../logger';
import { USER_PROJECTS_DIR } from '../config/user-paths';
import { isUnifiedFormat } from './unified-serializer';
import { UnifiedSerializer } from './unified-serializer';

export interface LocalPublishResult {
  articlesPublished: number;
  assetsCopied: number;
  errors: Array<{ file: string; error: string }>;
}

export interface LocalPublishProjectInfo {
  projectName: string;
  config: ILocalPublishConfig;
}

/**
 * Copy published articles and assets to a configured local folder.
 *
 * Rebuilds published/ from drafts, then copies to the target folder.
 * Cleans the content and assets subfolders before copying.
 */
export async function publishToLocalFolder(
  projectDir: string,
  config: ILocalPublishConfig,
  logger: Logger,
  projectConfig?: IProjectConfig,
  softCopy?: boolean,
): Promise<LocalPublishResult> {
  const result: LocalPublishResult = { articlesPublished: 0, assetsCopied: 0, errors: [] };

  // Validate target path exists
  if (!config.path || !existsSync(config.path)) {
    throw new Error(`Target path does not exist: ${config.path}`);
  }

  // Auto-run publish step to rebuild published/ from drafts/
  const draftsDir = path.join(projectDir, 'drafts');
  const publishedDir = path.join(projectDir, 'published');
  if (existsSync(draftsDir)) {
    const { buildPublished } = await import('./folder-manager.js');
    logger.log('Building published articles from drafts...');
    const publishResult = await buildPublished(projectDir, draftsDir, publishedDir, logger);
    logger.log(`Published ${publishResult.success} article(s)`);
  }

  // Template copy step: if templatePath is set, copy template and write merged config
  // Skip in soft-copy mode (preserves custom layouts/components/pages)
  if (!softCopy && config.templatePath) {
    if (!existsSync(config.templatePath)) {
      throw new Error(`Template path does not exist: ${config.templatePath}`);
    }

    // Copy template → target (recursive, overwrite existing files)
    await fs.cp(config.templatePath, config.path, { recursive: true, force: true });
    logger.log(`Copied template from ${config.templatePath}`);

    // Read config.defaults.json from the target (just-copied template)
    const defaultsPath = path.join(config.path, 'config.defaults.json');
    let defaults: Record<string, unknown> = {};
    if (existsSync(defaultsPath)) {
      const raw = await fs.readFile(defaultsPath, 'utf-8');
      defaults = JSON.parse(raw);
    }

    // Auto-inject project branding into template settings if available
    let effectiveSettings = (config.template_settings || (config as any).templateSettings || {}) as Record<string, any>;
    if (projectConfig?.branding && !(effectiveSettings as any).branding) {
      effectiveSettings = { ...effectiveSettings, branding: projectConfig.branding };
    }

    // Deep-merge template_settings on top of defaults
    const merged = Object.keys(effectiveSettings).length > 0
      ? deepMerge(defaults, effectiveSettings)
      : defaults;

    // Ensure data/ directory exists and write merged config
    const dataDir = path.join(config.path, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'site-config.json'),
      JSON.stringify(merged, null, 2),
      'utf-8',
    );
    logger.log(`Wrote merged site config to data/site-config.json`);
  }

  // When templatePath is set (and not soft-copy), ensure content subfolder exists (template may have created it)
  const contentDest = path.join(config.path, config.content_subfolder);
  if (softCopy) {
    // Soft mode: ensure dir exists but don't require it pre-exists
    await fs.mkdir(contentDest, { recursive: true });
  } else if (config.templatePath) {
    await fs.mkdir(contentDest, { recursive: true });
  } else if (!existsSync(contentDest)) {
    throw new Error(`Content subfolder does not exist: ${contentDest}`);
  }

  // Source directories (output of `publish` command)
  const publishedAssetsDir = path.join(projectDir, 'published-assets');

  if (!existsSync(publishedDir)) {
    throw new Error(
      `No published/ directory found. Run \`publish\` first to build published articles.`
    );
  }

  // Clean content subfolder to remove stale articles (skip in soft-copy mode)
  if (!softCopy) {
    await fs.rm(contentDest, { recursive: true, force: true });
    await fs.mkdir(contentDest, { recursive: true });
    logger.log(`Cleaned content folder: ${config.content_subfolder}`);
  }

  // Copy markdown files from published/ to content destination
  const mdFiles = await getAllFiles(publishedDir);
  for (const srcFile of mdFiles) {
    const relativePath = path.relative(publishedDir, srcFile);
    const destFile = path.join(contentDest, relativePath);

    try {
      await fs.mkdir(path.dirname(destFile), { recursive: true });
      await fs.copyFile(srcFile, destFile);
      result.articlesPublished++;
      logger.log(`  → ${relativePath}`);
    } catch (error) {
      result.errors.push({
        file: relativePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Copy assets from published-assets/ to assets destination
  if (existsSync(publishedAssetsDir)) {
    const assetsDest = path.join(config.path, config.assets_subfolder);

    // Clean assets subfolder to remove stale assets (skip in soft-copy mode)
    if (!softCopy) {
      await fs.rm(assetsDest, { recursive: true, force: true });
    }
    await fs.mkdir(assetsDest, { recursive: true });

    const assetFiles = await getAllFiles(publishedAssetsDir);
    for (const srcFile of assetFiles) {
      const relativePath = path.relative(publishedAssetsDir, srcFile);
      const destFile = path.join(assetsDest, relativePath);

      try {
        await fs.mkdir(path.dirname(destFile), { recursive: true });
        await fs.copyFile(srcFile, destFile);
        result.assetsCopied++;
      } catch (error) {
        result.errors.push({
          file: `assets/${relativePath}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return result;
}

/**
 * List all projects that have local folder publishing enabled.
 */
export async function listLocalPublishProjects(
  projectsDir?: string,
): Promise<LocalPublishProjectInfo[]> {
  const dir = projectsDir || USER_PROJECTS_DIR;
  const results: LocalPublishProjectInfo[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectDir = path.join(dir, entry.name);
    if (!await isUnifiedFormat(projectDir)) continue;

    try {
      const serializer = new UnifiedSerializer<IProjectConfig>(projectDir);
      const { data } = await serializer.read();
      if (!data) continue;

      if (data.publish_to_local_folder?.enabled) {
        results.push({
          projectName: entry.name,
          config: data.publish_to_local_folder,
        });
      }
    } catch {
      // Skip projects that can't be read
    }
  }

  return results;
}

/**
 * Returns the default template for configuring local publish in index.json.
 */
export function getLocalPublishTemplate(): string {
  return `  "publish_to_local_folder": {
    "enabled": true,
    "path": "/absolute/path/to/target/project",
    "content_subfolder": "src/content/blog",
    "assets_subfolder": "public/assets/blog"
  }`;
}

/**
 * Deep merge two objects. Arrays are replaced wholesale (not merged).
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
      && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Get all files in a directory recursively.
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
