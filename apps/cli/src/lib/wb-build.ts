/**
 * Local Website Builder
 *
 * Builds websites locally by directly calling the Website Builder's
 * `buildAstroSite` function, eliminating the need for the HTTP API server.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { parsePublishedFolder } from './published-parser.js';
import { normalizeUrl } from '../url-utils.js';
import type {
  BuildAstroSiteOptions,
  SiteConfig,
  BuildResult,
} from '../types/astro-builder.js';

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
  projectConfig?: {
    name?: string;
    url?: string;
    website_info?: { description?: string };
    title?: string;
    description?: string;
  };
  logger: { log: (msg: string) => void };
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

  // 3. Create job directory for assets
  const jobDir = path.join(projectRoot, '.blogpostgen', 'wb-build-job');
  await fs.mkdir(jobDir, { recursive: true });

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
  const siteName = projectConfig?.name || projectConfig?.title || projectName;
  const config: SiteConfig = {
    site: {
      name: siteName,
      url: normalizeUrl(projectConfig?.url || 'http://localhost:8080'),
      description: projectConfig?.website_info?.description || projectConfig?.description || '',
    },
    logo: {
      type: 'text',
      text: siteName,
    },
    header: {
      navLinks: [{ label: 'Home', url: '/' }],
      ctaButton: {
        enabled: false,
      },
    },
    footer: {
      columns: [],
      showPoweredBy: true,
    },
  };

  // 6. Set output directory
  const outputDir = path.join(projectRoot, 'website-preview');

  // 7. Import and call buildAstroSite
  try {
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
