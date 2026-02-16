import { promises as fs } from 'fs';
import path from 'path';
import { marked } from 'marked';

/**
 * Template rendering utility with AICW-style macro validation
 *
 * Provides robust macro replacement with three-stage validation:
 * 1. Pre-replacement: Validate macro names and values are non-empty
 * 2. During replacement: Verify template actually changes
 * 3. Post-replacement: Scan for unreplaced {{MACROS}}
 */
export class TemplateRenderer {
  private htmlTemplate: string = '';
  private mdTemplate: string = '';

  constructor(private templatesDir: string) {}

  /**
   * Initialize renderer by loading templates
   */
  async initialize(): Promise<void> {
    const htmlPath = path.join(this.templatesDir, 'article-output.html');
    const mdPath = path.join(this.templatesDir, 'article-output.md');

    this.htmlTemplate = await fs.readFile(htmlPath, 'utf8');
    this.mdTemplate = await fs.readFile(mdPath, 'utf8');
  }

  /**
   * Render HTML output from markdown content and metadata
   */
  async renderHTML(
    content: string,
    metadata: ArticleMetadata
  ): Promise<string> {
    // Convert markdown to HTML
    const contentHtml = await marked.parse(content);

    // Prepare macros (HTML uses {{CONTENT_HTML}})
    const macros: Record<string, string> = {
      '{{TITLE}}': metadata.title || 'Untitled',
      '{{SEO_META_DESCRIPTION}}': metadata.description || '',
      '{{SEO_META_KEYWORDS}}': metadata.keywords || '',
      '{{WORD_COUNT}}': String(metadata.wordCount || 0),
      '{{GENERATION_DATE}}': metadata.generatedAt || new Date().toISOString(),
      '{{CONTENT_HTML}}': contentHtml
    };

    return this.replaceMacrosInTemplate(this.htmlTemplate, macros);
  }

  /**
   * Render formatted Markdown output with YAML frontmatter
   */
  async renderMarkdown(
    content: string,
    metadata: ArticleMetadata
  ): Promise<string> {
    // Prepare macros (MD uses {{CONTENT_MD}})
    const macros: Record<string, string> = {
      '{{TITLE}}': metadata.title || 'Untitled',
      '{{PATH}}': metadata.path || '',
      '{{SEO_META_DESCRIPTION}}': metadata.description || '',
      '{{SEO_META_KEYWORDS}}': metadata.keywords || '',
      '{{WORD_COUNT}}': String(metadata.wordCount || 0),
      '{{GENERATION_DATE}}': metadata.generatedAt || new Date().toISOString(),
      '{{CONTENT_MD}}': content
    };

    return this.replaceMacrosInTemplate(this.mdTemplate, macros);
  }

  /**
   * Replace macros in template with AICW-style validation
   *
   * Three-stage validation ensures no silent failures:
   * 1. Validate macro names and values are non-empty
   * 2. Verify template changes during replacement
   * 3. Scan for any remaining unreplaced macros
   */
  private replaceMacrosInTemplate(
    template: string,
    macros: Record<string, string>
  ): string {
    let result = template;

    // Stage 1 & 2: Replace all macros with validation
    for (const [macro, value] of Object.entries(macros)) {
      // Validation: macro must not be empty
      if (!macro || macro.trim() === '') {
        throw new Error(`Macro is empty`);
      }

      // Validation: value must be non-empty string (allow 0, but not null/undefined)
      if (value === null || value === undefined || typeof value !== 'string') {
        throw new Error(
          `Value for macro '${macro}' is invalid: "${JSON.stringify(value)}"`
        );
      }

      // Note: We allow empty strings for optional fields like description
      // but they must be explicitly empty strings, not null/undefined

      // Replace macro in template (escape special regex chars in macro)
      const templateBefore = result;
      const escapedMacro = macro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escapedMacro, 'g'), value);

      // Verify replacement actually happened (only if macro should exist)
      if (result === templateBefore && template.includes(macro)) {
        throw new Error(
          `Macro ${macro} exists in template but was NOT replaced`
        );
      }
    }

    // Stage 3: Verify no unreplaced macros remain
    this.verifyNoUnreplacedMacros(result);

    return result;
  }

  /**
   * Scan for unreplaced {{MACROS}} and throw if any found
   * Uses regex pattern: /{{[A-Z0-9_]+}}/g
   */
  private verifyNoUnreplacedMacros(content: string): void {
    // Quick check for {{ and }} presence
    if (content.indexOf('{{') === -1 && content.indexOf('}}') === -1) {
      return; // All good
    }

    // Scan for unreplaced macros using AICW regex pattern
    const REGEX_MACROS = /{{[A-Z0-9_]+}}/g;
    const unreplacedMacros = content.match(REGEX_MACROS);

    if (unreplacedMacros && unreplacedMacros.length > 0) {
      throw new Error(
        `Template has unreplaced macros:\n${unreplacedMacros.join('\n')}`
      );
    }
  }
}

/**
 * Article metadata for template rendering
 */
export interface ArticleMetadata {
  title?: string;
  path?: string;
  description?: string;
  keywords?: string;
  wordCount?: number;
  generatedAt?: string;
}
