/**
 * Local Website Builder
 *
 * Builds websites locally by directly calling the Website Builder's
 * `buildAstroSite` function, eliminating the need for the HTTP API server.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import crypto from 'crypto';
import { parsePublishedFolder } from './published-parser.js';
import { normalizeUrl } from '../url-utils.js';
import { getProjectTmpDir } from '../config/user-paths.js';
import type {
  BuildAstroSiteOptions,
  SiteConfig,
  BuildResult,
} from '../types/astro-builder.js';
import type { IProjectConfig } from '@blogpostgen/types';

// ============ Path Resolution ============

/**
 * Get the path to the Astro template directory
 */
function getTemplatePath(): string {
  // Check environment variable first
  if (process.env.AICW_WB_TEMPLATE_PATH) {
    const envPath = process.env.AICW_WB_TEMPLATE_PATH;
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  // Try relative paths from CLI location within monorepo
  const possiblePaths = [
    // From dist/lib or src/lib: lib -> dist/src -> cli -> apps -> aicw-app-rails
    path.resolve(__dirname, '../../../../apps/wbuilder/templates/default'),
    // From monorepo root (cwd when run via bin/dev)
    path.resolve(process.cwd(), 'apps/wbuilder/templates/default'),
  ];

  for (const templatePath of possiblePaths) {
    if (existsSync(templatePath)) {
      return templatePath;
    }
  }

  throw new Error(
    'Astro template not found. Set AICW_WB_TEMPLATE_PATH env var or run from monorepo root.'
  );
}

/**
 * Get the path to the astro-builder.js module
 */
function getAstroBuilderPath(): string {
  // Check environment variable first
  if (process.env.AICW_WB_ASTRO_BUILDER_PATH) {
    const envPath = process.env.AICW_WB_ASTRO_BUILDER_PATH;
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  // Try relative paths from CLI location within monorepo
  const possiblePaths = [
    // From dist/lib or src/lib: lib -> dist/src -> cli -> apps -> aicw-app-rails
    path.resolve(__dirname, '../../../../apps/wbuilder/api-server/src/astro-builder.js'),
    // From monorepo root (cwd when run via bin/dev)
    path.resolve(process.cwd(), 'apps/wbuilder/api-server/src/astro-builder.js'),
  ];

  for (const builderPath of possiblePaths) {
    if (existsSync(builderPath)) {
      return builderPath;
    }
  }

  throw new Error(
    'astro-builder.js not found. Set AICW_WB_ASTRO_BUILDER_PATH env var or run from monorepo root.'
  );
}

// ============ Build Orchestration ============

export interface BuildWebsiteLocalOptions {
  projectRoot: string;
  projectName: string;
  projectConfig?: IProjectConfig;
  logger: { log: (msg: string) => void };
  /** Session ID for temp directory isolation (auto-generated if not provided) */
  sessionId?: string;
}

export interface BuildWebsiteLocalResult {
  success: boolean;
  path?: string;
  error?: string;
  articlesCount?: number;
  pagesCount?: number;
}

/**
 * Build website locally using buildAstroSite directly
 */
export async function buildWebsiteLocal(
  options: BuildWebsiteLocalOptions
): Promise<BuildWebsiteLocalResult> {
  const { projectRoot, projectName, projectConfig, logger } = options;
  const sid = options.sessionId || crypto.randomUUID().slice(0, 8);

  // 1. Read published articles
  const publishedDir = path.join(projectRoot, 'published');
  const articles = await parsePublishedFolder(publishedDir);

  if (articles.length === 0) {
    return { success: false, error: 'No published articles found. Run "publish" first.' };
  }

  logger.log(`Found ${articles.length} published articles`);

  // 2. Resolve paths
  let templateDir: string;
  let astroBuilderPath: string;

  try {
    templateDir = getTemplatePath();
    logger.log(`Using template: ${templateDir}`);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Template not found' };
  }

  try {
    astroBuilderPath = getAstroBuilderPath();
    logger.log(`Using astro-builder: ${astroBuilderPath}`);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Astro builder not found' };
  }

  // 3. Create session-scoped job directory for assets (prevents conflicts with parallel builds)
  const jobDir = path.join(getProjectTmpDir(projectName), `wb-build-${sid}`);
  await fs.mkdir(jobDir, { recursive: true });

  try {
    // 4. Copy assets from published-assets/ to job directory
    const publishedAssetsDir = path.join(projectRoot, 'published-assets');
    const jobAssetsDir = path.join(jobDir, 'assets');

    if (existsSync(publishedAssetsDir)) {
      logger.log('Copying assets...');
      await fs.rm(jobAssetsDir, { recursive: true, force: true });
      await fs.cp(publishedAssetsDir, jobAssetsDir, { recursive: true });
      const assetCount = await countFiles(jobAssetsDir);
      logger.log(`  Copied ${assetCount} assets`);
    }

    // 5. Build site config
    // Use project's branding + template_settings when available (from publish/Rails flow),
    // otherwise construct a minimal config. The template expects branding.site.url.
    const siteName = projectConfig?.branding?.site?.name || projectConfig?.title || projectName;
    const siteUrl = normalizeUrl(projectConfig?.url || '');
    if (!siteUrl || siteUrl === 'http://localhost:8080') {
      throw new Error(`Project "${projectName}" has no URL configured. Set "url" in project config.`);
    }

    const templateSettings = projectConfig?.publish_to_local_folder?.template_settings || {};
    const config: SiteConfig = {
      branding: projectConfig?.branding || {
        site: {
          name: siteName,
          url: siteUrl,
          description: '',
        },
        logo: {
          type: 'text' as const,
          text: siteName,
        },
        colors: {
          primary: '#1e3a8a',
          secondary: '#0ea5e9',
          background: '#f8fafc',
          background_secondary: '#F8FAFC',
          text_primary: '#0F172A',
          text_secondary: '#475569',
          border: '#E2E8F0',
        },
        dark_mode: {
          enabled: false,
          colors: {
            text_primary: '#FFFFFF',
            text_secondary: '#D1D5DB',
            background: '#111827',
            background_secondary: '#1F2937',
            border: '#374151',
          },
        },
      },
      ...templateSettings,
    };

    // 6. Set output directory
    const outputDir = path.join(projectRoot, 'website-preview');

    // 7. Import and call buildAstroSite
    logger.log('Building website...');

    // Dynamic import of the JS module
    const astroBuilder = await import(astroBuilderPath);
    const buildAstroSite = astroBuilder.buildAstroSite as (
      options: BuildAstroSiteOptions
    ) => Promise<BuildResult>;

    const buildOptions: BuildAstroSiteOptions = {
      templateDir,
      outputDir,
      config,
      articles,
      jobDir,
      logFn: (msg: string) => logger.log(`  ${msg}`),
    };

    const result = await buildAstroSite(buildOptions);

    return {
      success: true,
      path: outputDir,
      articlesCount: result.totalArticles,
      pagesCount: result.totalPages,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Build failed';
    return { success: false, error: errorMsg };
  } finally {
    // Clean up session-scoped temp directory
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Count files recursively in a directory
 */
async function countFiles(dir: string): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += await countFiles(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        count++;
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return count;
}
