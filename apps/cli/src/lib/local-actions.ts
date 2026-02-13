/**
 * Local Actions
 *
 * Actions that run locally on the CLI but call sgen API for processing.
 * This follows the sgen-centric architecture where the CLI is a thin client.
 *
 * Sgen-centric actions (call sgen API):
 * - render_diagrams: POST /api/v1/diagrams/render
 * - generate_image_hero: POST /api/v1/image/hero
 * - generate_image_social: POST /api/v1/image/social
 *
 * Pure local actions (no API calls):
 * - verify_assets: Checks local file existence
 * - verify_links_and_sources: Checks external URL availability
 */
import { verifyAssets } from '../utils/asset-verifier';
import { verifyLinks } from '../utils/link-verifier';
import { resolvePath, readArticleContent, getProjectConfig } from './path-resolver';
import { getProjectPaths } from '../config/user-paths';
import { updateArticleMeta } from './folder-manager';
import {
  loadActionConfig,
  loadActionPrompt,
} from './action-config-loader';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Load hero image as base64 data URL for OG background
 */
async function loadHeroImageAsBase64(
  projectRoot: string,
  heroPath: string | undefined,
  logger: { log: (msg: string) => void }
): Promise<string | null> {
  if (!heroPath) return null;

  const absolutePath = path.join(projectRoot, heroPath.replace(/^\//, ''));

  try {
    const buffer = await fs.readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'image/png';

    logger.log(`    Using hero image as OG background (${Math.round(buffer.length / 1024)}KB)`);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Result of a local action
 */
export interface LocalActionResult {
  success: boolean;
  count?: number;
  error?: string;
  costUsd?: number;
  tokensUsed?: number;
}

/**
 * Response from sgen /api/v1/diagrams/render endpoint
 */
interface DiagramRenderApiResponse {
  success: boolean;
  updated_content?: string;
  assets?: Array<{
    path: string;
    base64: string;
    alt_text: string;
    diagram_type: string;
  }>;
  failures?: Array<{
    index: number;
    mermaid_code: string;
    error: string;
  }>;
  render_time_ms?: number;
  error?: string;
}

/**
 * Render all mermaid diagrams in an article to PNG files (via sgen API)
 *
 * This is now a thin client that calls the sgen /api/v1/diagrams/render endpoint.
 * All diagram rendering logic has been moved to sgen for centralization.
 *
 * Flow:
 * 1. Read article content
 * 2. Call sgen /api/v1/diagrams/render endpoint
 * 3. Save returned PNG files to local assets
 * 4. Update article content with image references
 *
 * @param articlePath - CLI path (project-name/article-path)
 * @param logger - Logger for progress output
 * @param sgenBaseUrl - Base URL for Sgen API (default: http://localhost:3001)
 */
export async function renderDiagramsLocal(
  articlePath: string,
  logger: { log: (msg: string) => void },
  sgenBaseUrl: string = 'http://localhost:3001'
): Promise<LocalActionResult> {
  try {
    const resolved = resolvePath(articlePath);
    const articleData = await readArticleContent(resolved);

    if (!articleData) {
      return { success: false, error: 'Article not found' };
    }

    // Check if there are any mermaid diagrams
    const mermaidRegex = /```mermaid\n[\s\S]*?```/g;
    const matches = articleData.articleContent.match(mermaidRegex);

    if (!matches || matches.length === 0) {
      logger.log('    No mermaid diagrams found');
      return { success: false, error: 'No mermaid diagrams found. Remove render_diagrams from pipeline or add diagrams to article.' };
    }

    logger.log(`    Found ${matches.length} mermaid diagram(s)`);

    const resolvedArticlePath = resolved.articlePath || 'article';

    // Call sgen API to render diagrams (with 120s timeout for complex diagrams)
    logger.log('    Rendering diagrams via sgen...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    let response: Response;
    try {
      response = await fetch(`${sgenBaseUrl}/api/v1/diagrams/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: articleData.articleContent,
          article_path: resolvedArticlePath,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { success: false, error: 'Request timeout after 120s' };
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Sgen API error: ${response.status} - ${errorText}` };
    }

    const result = await response.json() as DiagramRenderApiResponse;

    if (!result.success) {
      return { success: false, error: result.error || 'Diagram rendering failed' };
    }

    // Save base64 images to local assets
    if (result.assets && result.assets.length > 0) {
      // Article-local assets folder: {article}/assets/{articlePath}/ - mirrors website structure
      const assetsDir = path.join(articleData.folderPath, 'assets', resolvedArticlePath);
      await fs.mkdir(assetsDir, { recursive: true });

      for (const asset of result.assets) {
        const filename = path.basename(asset.path);
        const pngPath = path.join(assetsDir, filename);
        const buffer = Buffer.from(asset.base64, 'base64');
        await fs.writeFile(pngPath, buffer);
        logger.log(`    Saved: ${pngPath}`);
      }
    }

    // Update article content with image references
    if (result.updated_content && result.assets && result.assets.length > 0) {
      // Write to content.md (NOT index.md - that would create an 'index' field in index.json)
      const contentPath = path.join(articleData.folderPath, 'content.md');
      await fs.writeFile(contentPath, result.updated_content, 'utf-8');
      logger.log(`    Updated article with ${result.assets.length} image reference(s)`);
    }

    // Report failures if any diagrams failed to render
    if (result.failures && result.failures.length > 0) {
      logger.log(`    WARNING: ${result.failures.length} diagram(s) failed to render:`);
      for (const f of result.failures) {
        logger.log(`      - Diagram ${f.index + 1}: ${f.error}`);
      }

      // Fail the action if ANY diagrams failed
      return {
        success: false,
        error: `${result.failures.length} diagram(s) failed to render`,
        count: result.failures.length,
      };
    }

    return { success: true, count: result.assets?.length || 0 };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * List of local-only modes that should bypass API calls
 */
export const LOCAL_MODES = [
  'generate_image_social',
  'verify_assets',
  'verify_links_and_sources',
] as const;

/**
 * Check if a mode is a local-only mode
 */
export function isLocalMode(mode: string): boolean {
  return LOCAL_MODES.includes(mode as any);
}

/**
 * Response from sgen /api/v1/image/hero endpoint
 */
interface HeroImageApiResponse {
  success: boolean;
  skipped?: boolean;
  skip_reason?: 'path_not_included' | 'no_include_paths';
  image?: {
    data: string;           // base64 PNG
    width: number;
    height: number;
    suggested_filename: string;
  };
  prompt_used?: string;
  cost_usd?: number;
  error?: string;
}

/**
 * Generate a hero image for an article (sgen-centric architecture)
 *
 * This is now a thin client that calls the sgen /api/v1/image/hero endpoint.
 * All image generation logic has been moved to sgen for:
 * - Centralized logic (aicw-app can also use it)
 * - Single source of truth for image generation
 *
 * Flow:
 * 1. Read article meta and project config
 * 2. Load action config (include_paths) and custom prompt template
 * 3. Load branding from _project.yaml
 * 4. Call sgen /api/v1/image/hero endpoint
 * 5. If success + not skipped: save image locally, update meta
 * 6. If success + skipped: log reason, return success
 *
 * @param articlePath - CLI path (project-name/article-path)
 * @param logger - Logger for progress output
 * @param sgenBaseUrl - Base URL for Sgen API (default: http://localhost:3001)
 */
export async function generateImageHeroLocal(
  articlePath: string,
  logger: { log: (msg: string) => void },
  sgenBaseUrl: string = 'http://localhost:3001'
): Promise<LocalActionResult> {
  try {
    const resolved = resolvePath(articlePath);
    const articleData = await readArticleContent(resolved);

    if (!articleData) {
      return { success: false, error: 'Article not found' };
    }

    const { meta, folderPath } = articleData;

    // Check if hero image already exists AND the file is actually on disk
    if (meta.image_hero) {
      const heroRelPath = meta.image_hero.replace(/^\//, '');
      const heroAbsPath = path.join(folderPath, 'assets', heroRelPath.replace(/^assets\//, ''));
      try {
        await fs.access(heroAbsPath);
        logger.log('    Hero image already exists, skipping');
        return { success: true, count: 0 };
      } catch {
        logger.log(`    Warning: image_hero references missing file: ${meta.image_hero}, regenerating...`);
      }
    }

    const projectPaths = getProjectPaths(resolved.projectName);
    const projectConfig = await getProjectConfig(resolved);
    const resolvedArticlePath = resolved.articlePath || 'article';

    // Load action config for include_paths
    const actionConfig = await loadActionConfig(projectPaths.root, 'generate_image_hero');

    // Check for user prompt override
    const customPromptTemplate = await loadActionPrompt(projectPaths.root, 'generate_image_hero');

    if (customPromptTemplate) {
      logger.log('    Using custom prompt template');
    }

    // Build request for sgen API
    const requestBody = {
      article: {
        path: resolvedArticlePath,
        title: meta.title,
        description: meta.description || '',
        keywords: meta.keywords,
      },
      branding: projectConfig?.branding,
      include_paths: actionConfig?.include_paths,
      custom_prompt_template: customPromptTemplate || undefined,
      options: {
        width: 1200,
        height: 630,
      },
    };

    // Call sgen API to generate hero image (with 90s timeout for AI image generation)
    logger.log('    Generating hero image via sgen...');
    const heroController = new AbortController();
    const heroTimeoutId = setTimeout(() => heroController.abort(), 90000);

    let heroResponse: Response;
    try {
      heroResponse = await fetch(`${sgenBaseUrl}/api/v1/image/hero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: heroController.signal,
      });
    } catch (err: any) {
      clearTimeout(heroTimeoutId);
      if (err.name === 'AbortError') {
        return { success: false, error: 'Request timeout after 90s' };
      }
      throw err;
    }
    clearTimeout(heroTimeoutId);

    if (!heroResponse.ok) {
      const errorText = await heroResponse.text();
      return { success: false, error: `Sgen API error: ${heroResponse.status} - ${errorText}` };
    }

    const result = await heroResponse.json() as HeroImageApiResponse;

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to generate hero image', costUsd: result.cost_usd };
    }

    // Handle skipped case (valid skip - pipeline continues)
    if (result.skipped) {
      const reason = result.skip_reason === 'no_include_paths'
        ? 'no include_paths configured'
        : 'path not in include_paths';
      logger.log(`    Skipped: ${reason}`);
      return { success: true, count: 0 };
    }

    // Save image locally
    if (!result.image) {
      return { success: false, error: 'No image data in response', costUsd: result.cost_usd };
    }

    // Article-local assets folder: {article}/assets/{articlePath}/ - mirrors website structure
    const assetsDir = path.join(folderPath, 'assets', resolvedArticlePath);
    await fs.mkdir(assetsDir, { recursive: true });

    const heroFilename = 'hero.webp';
    const heroPath = path.join(assetsDir, heroFilename);
    const imageBuffer = Buffer.from(result.image.data, 'base64');
    await fs.writeFile(heroPath, imageBuffer);
    logger.log(`    Saved: ${heroPath} (${Math.round(imageBuffer.length / 1024)}KB)`);

    // Update article meta with image_hero path
    const imageHeroPath = `/assets/${resolvedArticlePath}/${heroFilename}`;
    await updateArticleMeta(folderPath, { image_hero: imageHeroPath });
    logger.log(`    Updated meta.md with image_hero: ${imageHeroPath}`);

    return {
      success: true,
      count: 1,
      costUsd: result.cost_usd,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Response from sgen /api/v1/image/social endpoint
 */
interface SocialImageApiResponse {
  success: boolean;
  image?: {
    data: string;           // base64 PNG
    filename: string;
  };
  cost_usd: number;
  error?: string;
}

/**
 * Generate a social preview (OG) image for an article (via sgen API)
 *
 * This is now a thin client that calls the sgen /api/v1/image/social endpoint.
 * All image generation logic has been moved to sgen for centralization.
 *
 * Flow:
 * 1. Read article meta to get title, description
 * 2. Load hero image if available (for OG background)
 * 3. Call sgen /api/v1/image/social endpoint
 * 4. Save returned image to local assets
 * 5. Update meta.md with image_og path
 *
 * @param articlePath - CLI path (project-name/article-path)
 * @param logger - Logger for progress output
 * @param sgenBaseUrl - Base URL for Sgen API (default: http://localhost:3001)
 */
export async function generateImageSocialLocal(
  articlePath: string,
  logger: { log: (msg: string) => void },
  sgenBaseUrl: string = 'http://localhost:3001'
): Promise<LocalActionResult> {
  try {
    const resolved = resolvePath(articlePath);
    const articleData = await readArticleContent(resolved);

    if (!articleData) {
      return { success: false, error: 'Article not found' };
    }

    const { meta, folderPath } = articleData;

    // Check if OG image already exists
    if (meta.image_og) {
      logger.log('    OG image already exists, skipping');
      return { success: true, count: 0 };
    }

    const projectConfig = await getProjectConfig(resolved);
    const resolvedArticlePath = resolved.articlePath || 'article';

    // Determine brand name from project config
    let brandName: string | undefined;
    if (projectConfig?.title) {
      brandName = projectConfig.title;
    } else if (projectConfig?.url) {
      brandName = projectConfig.url.replace(/^https?:\/\//, '');
    }

    // Format date if available
    let dateStr: string | undefined;
    const dateSource = meta.published_at || meta.created_at;
    if (dateSource) {
      try {
        const date = new Date(dateSource);
        dateStr = date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      } catch {
        // Ignore date formatting errors
      }
    }

    // Load hero image if available (for OG background)
    const heroImageBase64 = await loadHeroImageAsBase64(folderPath, meta.image_hero, logger);

    // Build request for sgen API
    const requestBody = {
      article: {
        title: meta.title,
        description: meta.description,
        author: (meta as any).author,
        date: dateStr,
      },
      branding: {
        brand_name: brandName,
      },
      hero_image_base64: heroImageBase64 || undefined,
    };

    // Call sgen API to generate social image (with 60s timeout for local Satori rendering)
    logger.log('    Generating social preview image via sgen...');
    const socialController = new AbortController();
    const socialTimeoutId = setTimeout(() => socialController.abort(), 60000);

    let socialResponse: Response;
    try {
      socialResponse = await fetch(`${sgenBaseUrl}/api/v1/image/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: socialController.signal,
      });
    } catch (err: any) {
      clearTimeout(socialTimeoutId);
      if (err.name === 'AbortError') {
        return { success: false, error: 'Request timeout after 60s' };
      }
      throw err;
    }
    clearTimeout(socialTimeoutId);

    if (!socialResponse.ok) {
      const errorText = await socialResponse.text();
      return { success: false, error: `Sgen API error: ${socialResponse.status} - ${errorText}` };
    }

    const result = await socialResponse.json() as SocialImageApiResponse;

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to generate social image', costUsd: result.cost_usd };
    }

    if (!result.image) {
      return { success: false, error: 'No image data in response', costUsd: result.cost_usd };
    }

    // Save image locally
    // Article-local assets folder: {article}/assets/{articlePath}/ - mirrors website structure
    const assetsDir = path.join(folderPath, 'assets', resolvedArticlePath);
    await fs.mkdir(assetsDir, { recursive: true });

    const ogPath = path.join(assetsDir, result.image.filename);
    const imageBuffer = Buffer.from(result.image.data, 'base64');
    await fs.writeFile(ogPath, imageBuffer);
    logger.log(`    Saved: ${ogPath} (${Math.round(imageBuffer.length / 1024)}KB)`);

    // Update meta
    const imageOgPath = `/assets/${resolvedArticlePath}/${result.image.filename}`;
    await updateArticleMeta(folderPath, { image_og: imageOgPath });
    logger.log(`    Updated meta.md with image_og: ${imageOgPath}`);

    return { success: true, count: 1, costUsd: result.cost_usd };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verify all local asset paths (images) in an article exist on disk
 *
 * Checks:
 * - meta.image_hero path
 * - meta.image_og path
 * - All local images in content (![...](/assets/...))
 *
 * @param articlePath - CLI path (project-name/article-path)
 * @param logger - Logger for progress output
 */
export async function verifyAssetsLocal(
  articlePath: string,
  logger: { log: (msg: string) => void }
): Promise<LocalActionResult> {
  try {
    const resolved = resolvePath(articlePath);
    const articleData = await readArticleContent(resolved);

    if (!articleData) {
      return { success: false, error: 'Article not found' };
    }

    // Use article folder path since assets are stored locally in article/assets/
    const result = await verifyAssets(
      articleData.folderPath,
      articleData.articleContent,
      articleData.meta
    );

    // Report warnings (e.g., hero image too small)
    if (result.warnings?.length > 0) {
      for (const warning of result.warnings) {
        logger.log(`    WARNING: ${warning.message} (${warning.path})`);
      }
    }

    if (!result.success) {
      logger.log(`    FAILED: ${result.missing.length} missing asset(s):`);
      for (const asset of result.missing) {
        logger.log(`      - ${asset.path} (${asset.source})`);
      }
      return {
        success: false,
        error: `${result.missing.length} missing asset(s)`,
        count: result.missing.length,
      };
    }

    logger.log(`    Verified ${result.totalChecked} asset(s) - all exist`);
    return { success: true, count: result.totalChecked };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verify all external links in an article are accessible
 *
 * Checks all URLs starting with http:// or https:// in:
 * - Markdown links: [text](https://...)
 * - Image links: ![alt](https://...)
 *
 * Uses HEAD requests with GET fallback, 5s timeout, batch processing.
 *
 * @param articlePath - CLI path (project-name/article-path)
 * @param logger - Logger for progress output
 */
export async function verifyLinksLocal(
  articlePath: string,
  logger: { log: (msg: string) => void }
): Promise<LocalActionResult> {
  try {
    const resolved = resolvePath(articlePath);
    const articleData = await readArticleContent(resolved);

    if (!articleData) {
      return { success: false, error: 'Article not found' };
    }

    logger.log('    Checking external URLs...');
    const result = await verifyLinks(articleData.articleContent);

    if (result.totalChecked === 0) {
      logger.log('    No external links found');
      return { success: true, count: 0 };
    }

    if (!result.success) {
      logger.log(`    FAILED: ${result.failed.length} broken link(s):`);
      for (const link of result.failed) {
        const status = link.statusCode
          ? `HTTP ${link.statusCode}`
          : link.errorType || 'error';
        logger.log(`      - ${link.url} (${status})`);
      }
      return {
        success: false,
        error: `${result.failed.length} broken link(s)`,
        count: result.failed.length,
      };
    }

    logger.log(`    Verified ${result.totalChecked} link(s) - all accessible`);
    return { success: true, count: result.totalChecked };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
