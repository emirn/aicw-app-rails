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
export function getPublishMethod(config: ILocalPublishConfig): 'template' | 'copy' {
  return config.template_path ? 'template' : 'copy';
}

export async function publishToLocalFolder(
  projectDir: string,
  config: ILocalPublishConfig,
  logger: Logger,
  projectConfig?: IProjectConfig,
): Promise<LocalPublishResult> {
  const softCopy = !config.template_path;
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
  if (!softCopy && config.template_path) {
    if (!existsSync(config.template_path)) {
      throw new Error(`Template path does not exist: ${config.template_path}`);
    }

    // Clean target directory before copying template (preserve .git for submodule support)
    await cleanDirectory(config.path);
    logger.log('Cleaned target directory (preserved .git)');

    // Copy template → target (recursive, overwrite existing files; skip node_modules/dist/.astro)
    await fs.cp(config.template_path, config.path, {
      recursive: true,
      force: true,
      filter: (source) => {
        const basename = path.basename(source);
        return basename !== 'node_modules' && basename !== 'dist' && basename !== '.astro';
      },
    });
    logger.log(`Copied template from ${config.template_path}`);

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
    // Auto-inject typography from branding into root-level typography for template
    if (projectConfig?.branding?.typography && !(effectiveSettings as any).typography) {
      effectiveSettings = { ...effectiveSettings, typography: projectConfig.branding.typography };
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

  // Clean Astro content cache to prevent stale data-store duplicate warnings
  const astroDataStore = path.join(config.path, '.astro', 'data-store.json');
  if (existsSync(astroDataStore)) {
    await fs.rm(astroDataStore);
    logger.log('Cleaned Astro data store cache');
  }

  // Copy pages (check pages/ first, fall back to legacy custom-pages/)
  const pagesDir = path.join(projectDir, 'pages');
  const legacyPagesDir = path.join(projectDir, 'custom-pages');
  const effectivePagesDir = existsSync(pagesDir) ? pagesDir : existsSync(legacyPagesDir) ? legacyPagesDir : null;
  const pagesDest = path.join(config.path, config.pages_subfolder || 'src/content/pages');

  if (effectivePagesDir) {
    const pagesAssetsDest = path.join(config.path, config.assets_subfolder);

    const pageFolders = await fs.readdir(effectivePagesDir, { withFileTypes: true });
    for (const folder of pageFolders.filter(f => f.isDirectory())) {
      const pageDir = path.join(effectivePagesDir, folder.name);

      // Copy index.md or index.mdx → src/content/pages/{path}.md(x)
      const indexMdx = path.join(pageDir, 'index.mdx');
      const indexMd = path.join(pageDir, 'index.md');
      const sourceFile = existsSync(indexMdx) ? indexMdx : existsSync(indexMd) ? indexMd : null;
      if (sourceFile) {
        const ext = path.extname(sourceFile);
        await fs.mkdir(pagesDest, { recursive: true });
        await fs.copyFile(sourceFile, path.join(pagesDest, `${folder.name}${ext}`));
        logger.log(`  → page: ${folder.name}${ext}`);
      }

      // Copy assets/ → public/assets/pages/{path}/
      const assetsDir = path.join(pageDir, 'assets');
      if (existsSync(assetsDir)) {
        const destAssets = path.join(pagesAssetsDest, folder.name);
        await fs.cp(assetsDir, destAssets, { recursive: true, force: true });
        logger.log(`  → page assets: pages/${folder.name}/`);
      }
    }
  }

  // Always ensure pages directory exists (template content config expects it)
  await fs.mkdir(pagesDest, { recursive: true });

  // When templatePath is set (and not soft-copy), ensure content subfolder exists (template may have created it)
  const contentDest = path.join(config.path, config.content_subfolder);
  if (softCopy) {
    // Soft mode: ensure dir exists but don't require it pre-exists
    await fs.mkdir(contentDest, { recursive: true });
  } else if (config.template_path) {
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

  // Copy branding/favicon files to site root for /favicon.ico compatibility
  const brandingAssetsDir = path.join(publishedAssetsDir, 'branding');
  if (existsSync(brandingAssetsDir)) {
    for (const ext of ['ico', 'png', 'svg']) {
      const faviconSrc = path.join(brandingAssetsDir, `favicon.${ext}`);
      if (existsSync(faviconSrc)) {
        const publicDir = path.join(config.path, 'public');
        await fs.mkdir(publicDir, { recursive: true });
        await fs.copyFile(faviconSrc, path.join(publicDir, `favicon.${ext}`));
        logger.log(`  Copied favicon.${ext} to public/`);
      }
    }
  }

  // Merge custom project styles into project.css
  const stylesDir = path.join(projectDir, 'config/styles');
  let projectCss = '/* Project-specific styles */\n';
  const globalStylesPath = path.join(stylesDir, 'styles.css');
  if (existsSync(globalStylesPath)) {
    projectCss += await fs.readFile(globalStylesPath, 'utf-8') + '\n';
  }
  try {
    const entries = await fs.readdir(stylesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sectionCss = path.join(stylesDir, entry.name, 'styles.css');
        if (existsSync(sectionCss)) {
          projectCss += `/* Section: ${entry.name} */\n`;
          projectCss += await fs.readFile(sectionCss, 'utf-8') + '\n';
        }
      }
    }
  } catch { /* no styles dir */ }
  const projectCssPath = path.join(config.path, 'src/styles/project.css');
  await fs.writeFile(projectCssPath, projectCss);
  logger.log('Merged custom project styles into project.css');

  // Merge custom project scripts into project-scripts.js
  let projectJs = '/* Project-specific scripts */\n';
  const globalScriptsPath = path.join(stylesDir, 'scripts.js');
  if (existsSync(globalScriptsPath)) {
    projectJs += await fs.readFile(globalScriptsPath, 'utf-8') + '\n';
  }
  try {
    const jsEntries = await fs.readdir(stylesDir, { withFileTypes: true });
    for (const entry of jsEntries) {
      if (entry.isDirectory()) {
        const sectionJs = path.join(stylesDir, entry.name, 'scripts.js');
        if (existsSync(sectionJs)) {
          projectJs += `/* Section: ${entry.name} */\n`;
          projectJs += await fs.readFile(sectionJs, 'utf-8') + '\n';
        }
      }
    }
  } catch { /* no styles dir */ }
  const scriptsDir = path.join(config.path, 'src/scripts');
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.writeFile(path.join(scriptsDir, 'project-scripts.js'), projectJs);
  logger.log('Merged custom project scripts into project-scripts.js');

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
 * Remove all entries in a directory except the specified ones.
 */
async function cleanDirectory(dir: string, preserve: string[] = ['.git']): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (preserve.includes(entry.name)) continue;
    await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
  }
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
