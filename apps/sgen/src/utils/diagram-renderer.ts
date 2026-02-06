import { BaseRenderer, BaseRendererAsset, RenderOptions } from './base-renderer';
import { convertToWebp } from './webp-converter';

// Maximum width for generated diagrams in pixels
const MAX_DIAGRAM_WIDTH = 800;

/**
 * DiagramAsset extends BaseRendererAsset with diagram-specific properties
 */
export interface DiagramAsset extends BaseRendererAsset {
  diagramType: string;
  mermaidCode: string;
}

/**
 * Information about a failed diagram rendering
 */
export interface DiagramFailure {
  index: number;
  mermaidCode: string;
  error: string;
}

/**
 * Result of processing diagrams in an article
 */
export interface DiagramProcessResult {
  updatedContent: string;
  assets: DiagramAsset[];
  failures: DiagramFailure[];
}

/**
 * Renderer for Mermaid diagrams (server version)
 * Converts Mermaid markdown code blocks to PNG images
 * Returns base64-encoded buffers for API response
 */
export class DiagramRenderer extends BaseRenderer<DiagramAsset> {
  constructor() {
    super('mermaid.html');
  }

  /**
   * Render a single Mermaid diagram to PNG
   */
  async renderMermaidToPNG(code: string, baseFilename: string, altText: string): Promise<DiagramAsset> {
    const contentHash = this.hash(code);
    const diagramType = this.detectDiagramType(code);

    const buffer = await this.renderToBuffer(code, {
      width: MAX_DIAGRAM_WIDTH,
      height: 800,
      selector: '#mermaid-container'
    });

    const filename = `${baseFilename}.webp`;

    return {
      buffer,
      filename,
      altText,
      diagramType,
      contentHash,
      mermaidCode: code,
      sourceContent: code
    };
  }

  /**
   * Render Mermaid code to PNG buffer
   */
  protected async renderToBuffer(code: string, options: RenderOptions): Promise<Buffer> {
    const html = this.renderTemplate('MERMAID_CODE', code);

    const page = await this.createPage({
      width: options.width,
      height: options.height
    });

    // Capture mermaid parse errors from console
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for Mermaid to finish rendering (SVG appears) with timeout
    try {
      await page.waitForSelector('.mermaid svg', { timeout: 5000 });
    } catch {
      // If timeout, check if SVG exists anyway (slow render)
      const svg = await page.$('.mermaid svg');
      if (!svg) {
        await page.close();
        throw new Error('Mermaid render timeout - SVG not generated');
      }
    }

    // Check for mermaid error element (displayed when parse fails)
    const errorElement = await page.$('.mermaid .error, .mermaid pre.errorMessage, #d .error');
    if (errorElement) {
      const errorText = await errorElement.evaluate(el => el.textContent);
      await page.close();
      throw new Error(`Mermaid parse error: ${errorText || 'Unknown error'}`);
    }

    // Find the actual SVG element (mermaid generates an SVG inside .mermaid)
    const element = await page.$('.mermaid svg');
    if (!element) {
      await page.close();
      const errorMsg = consoleErrors.length > 0
        ? `Mermaid SVG not found. Console errors: ${consoleErrors.join('; ')}`
        : 'Mermaid SVG not found';
      throw new Error(errorMsg);
    }

    const pngBuffer = await element.screenshot({ type: 'png', omitBackground: true });
    await page.close();

    // Convert PNG to WebP for better compression
    const webpBuffer = await convertToWebp(pngBuffer as Buffer);
    return webpBuffer;
  }

  /**
   * Process all mermaid diagrams in an article
   * @param content - Article markdown content
   * @param articlePath - Article path with slashes (e.g., 'blog/my-article')
   */
  async processArticle(content: string, articlePath: string): Promise<DiagramProcessResult> {
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    const matches = Array.from(content.matchAll(mermaidRegex));
    const assets: DiagramAsset[] = [];
    const failures: DiagramFailure[] = [];
    let updatedContent = content;

    // Track used filenames to handle duplicates
    const usedFilenames = new Map<string, number>();

    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const mermaidCode = match[1].trim();
      const matchIndex = match.index!;
      const altText = this.extractAltText(content, matchIndex);

      try {
        const diagramSlug = this.extractDiagramSlug(mermaidCode);

        // Handle duplicate filenames by appending counter
        let baseFilename = diagramSlug;
        const count = usedFilenames.get(diagramSlug) || 0;
        if (count > 0) {
          baseFilename = `${diagramSlug}-${count + 1}`;
        }
        usedFilenames.set(diagramSlug, count + 1);

        // Apply sanitization before rendering to handle special characters
        const sanitizedCode = this.sanitizeMermaidCode(mermaidCode);
        const asset = await this.renderMermaidToPNG(sanitizedCode, baseFilename, altText);
        assets.push(asset);

        const imageMd = `![${altText}](/assets/${articlePath}/${asset.filename})`;
        updatedContent = updatedContent.substring(0, matchIndex) + imageMd + updatedContent.substring(matchIndex + match[0].length);
      } catch (error) {
        // Track the failure instead of silently swallowing it
        failures.push({
          index: i,
          mermaidCode: mermaidCode.substring(0, 100) + (mermaidCode.length > 100 ? '...' : ''),
          error: error instanceof Error ? error.message : String(error),
        });
        // Leave diagram in content unchanged (don't replace with broken image)
      }
    }

    return { updatedContent, assets, failures };
  }

  /**
   * Detect Mermaid diagram type from first line of code
   */
  private detectDiagramType(code: string): string {
    const firstLine = code.split('\n')[0].trim().toLowerCase();
    const types: Record<string, string> = {
      'graph': 'flowchart',
      'flowchart': 'flowchart',
      'sequencediagram': 'sequence',
      'classdiagram': 'class',
      'statediagram': 'state',
      'erdiagram': 'er',
      'gantt': 'gantt',
      'pie': 'pie',
      'timeline': 'timeline',
      'journey': 'journey'
    };

    for (const [key, type] of Object.entries(types)) {
      if (firstLine.startsWith(key)) return type;
    }
    return 'flowchart';
  }

  /**
   * Extract alt text from nearest preceding heading
   */
  private extractAltText(content: string, diagramIndex: number): string {
    const before = content.substring(0, diagramIndex);
    const lines = before.split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(/^#{2,3}\s+(.+)$/);
      if (match) return match[1].trim() + ' Diagram';
    }
    return 'Diagram';
  }

  /**
   * Extract descriptive slug from mermaid code
   */
  private extractDiagramSlug(code: string): string {
    // Strip HTML tags first
    const noHtml = code.replace(/<[^>]*>/g, ' ');

    // Mermaid syntax keywords to exclude from slug
    const mermaidKeywords = new Set([
      'graph', 'flowchart', 'sequencediagram', 'classdiagram', 'statediagram',
      'erdiagram', 'gantt', 'pie', 'mindmap', 'timeline', 'journey',
      'td', 'tb', 'bt', 'lr', 'rl',
      'subgraph', 'end', 'direction', 'section', 'title',
      'participant', 'actor', 'note', 'loop', 'alt', 'opt', 'par', 'rect',
      'activate', 'deactivate', 'over', 'right', 'left',
      'class', 'interface', 'annotation',
      'state',
      'style', 'classdef', 'click', 'linkstyle',
      'href', 'http', 'https', 'www', 'com', 'org', 'io',
    ]);

    const words = noHtml
      .replace(/[^A-Za-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4)
      .filter(w => !mermaidKeywords.has(w.toLowerCase()))
      .slice(0, 3)
      .map(w => w.toLowerCase());

    return words.join('-') || 'diagram';
  }

  /**
   * Sanitize mermaid code to prevent XSS attacks
   * Minimal sanitization - Mermaid handles most escaping internally
   */
  private sanitizeMermaidCode(code: string): string {
    return code
      // Only escape script tags that could break out of the mermaid context
      .replace(/<script/gi, '&lt;script')
      .replace(/<\/script/gi, '&lt;/script');
  }
}

// Singleton instance for reuse across requests
let rendererInstance: DiagramRenderer | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get or create the singleton DiagramRenderer instance
 * Ensures browser is only launched once for performance
 */
export async function getDiagramRenderer(): Promise<DiagramRenderer> {
  if (!rendererInstance) {
    rendererInstance = new DiagramRenderer();
    initPromise = rendererInstance.initialize();
  }
  await initPromise;
  return rendererInstance;
}

/**
 * Close the singleton renderer (for graceful shutdown)
 */
export async function closeDiagramRenderer(): Promise<void> {
  if (rendererInstance) {
    await rendererInstance.close();
    rendererInstance = null;
    initPromise = null;
  }
}
