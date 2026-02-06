import puppeteer, { Browser, Page } from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

/**
 * Base interface for renderer-generated assets
 * Returns base64-encoded data instead of file paths for API response
 */
export interface BaseRendererAsset {
  buffer: Buffer;
  filename: string;
  altText: string;
  contentHash: string;
  sourceContent: string;
}

/**
 * Abstract base class for content renderers (server version)
 * Provides common browser lifecycle management, templating, and utilities
 *
 * Key differences from CLI version:
 * - Returns buffers for base64 encoding (no file system writes)
 * - Template path resolved relative to templates/ directory
 * - Optimized Puppeteer launch options for Docker containers
 */
export abstract class BaseRenderer<TAsset extends BaseRendererAsset = BaseRendererAsset> {
  protected browser?: Browser;
  protected templateHtml: string = '';

  /**
   * @param templateName - Name of template file in templates/ directory
   */
  constructor(protected templateName: string) {}

  /**
   * Initialize the renderer - load template and launch browser
   * Call this before rendering any content
   */
  async initialize(): Promise<void> {
    const templatePath = path.join(__dirname, '../../templates', this.templateName);
    this.templateHtml = await fs.readFile(templatePath, 'utf8');
    this.browser = await puppeteer.launch(this.getLaunchOptions());
  }

  /**
   * Close the browser and clean up resources
   * Always call this when done rendering (use try/finally)
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  /**
   * Get Puppeteer launch options
   * Optimized for Docker containers with memory constraints
   */
  protected getLaunchOptions(): Parameters<typeof puppeteer.launch>[0] {
    return {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    };
  }

  /**
   * Create a new page with specified viewport dimensions
   */
  protected async createPage(viewport: { width: number; height: number }): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const page = await this.browser.newPage();
    await page.setViewport({
      ...viewport,
      deviceScaleFactor: 2  // 2x resolution for sharper text
    });
    return page;
  }

  /**
   * Generate MD5 hash of content for deduplication
   * Returns first 8 characters of hex digest
   */
  protected hash(content: string): string {
    return createHash('md5').update(content).digest('hex').substring(0, 8);
  }

  /**
   * Replace placeholder in template with actual content
   */
  protected renderTemplate(placeholder: string, content: string): string {
    return this.templateHtml.replace(`{{${placeholder}}}`, content);
  }

  /**
   * Process content and render all matching patterns to images
   *
   * @param content - Article markdown content
   * @param articlePath - Article path for asset path generation
   * @returns Updated content with image references + generated assets
   */
  abstract processArticle(
    content: string,
    articlePath: string
  ): Promise<{
    updatedContent: string;
    assets: TAsset[];
  }>;

  /**
   * Render specific content to PNG buffer
   */
  protected abstract renderToBuffer(
    content: string,
    options: RenderOptions
  ): Promise<Buffer>;
}

/**
 * Common rendering options
 */
export interface RenderOptions {
  width: number;
  height: number;
  selector?: string;
}
