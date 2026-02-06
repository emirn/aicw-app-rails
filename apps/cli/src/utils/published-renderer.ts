import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Default template for published articles
 * Uses META_* prefixed macros that match meta.md field names
 */
const DEFAULT_TEMPLATE = `---
date: {{META_CREATED_AT}}
date_updated_at: {{META_UPDATED_AT}}
title: "{{META_TITLE}}"
description: "{{META_DESCRIPTION}}"
og_title: "{{META_TITLE}}"
og_description: "{{META_DESCRIPTION}}"
twitter_title: "{{META_TITLE}}"
twitter_description: "{{META_DESCRIPTION}}"
breadcrumbs: "Home/Blog/{{META_TITLE}}"
things: "{{META_KEYWORDS}}"
keywords: "{{META_KEYWORDS}}"
---

{{CONTENT_MD}}

{{FAQ_MD}}
`;

const TEMPLATE_FILENAME = 'template_published.md';

/**
 * Metadata from meta.md for published article rendering
 */
export interface PublishedMetadata {
  title: string;
  description: string;
  keywords: string[];
  created_at: string;
  updated_at: string;
  /** When the article should be published. If not set, defaults to created_at */
  published_at?: string;
  version?: number;
  last_pipeline?: string;
  /** FAQ content in HTML/markdown format */
  faq?: string;
}

/**
 * Published article renderer
 *
 * Renders articles from ready/ to published/ format using a per-project template.
 * Creates default template if not exists in project folder.
 */
export class PublishedRenderer {
  private template: string = '';
  private templatePath: string;

  constructor(private projectDir: string) {
    this.templatePath = path.join(projectDir, TEMPLATE_FILENAME);
  }

  /**
   * Initialize renderer - load template or create default
   */
  async initialize(): Promise<void> {
    if (existsSync(this.templatePath)) {
      this.template = await fs.readFile(this.templatePath, 'utf8');
    } else {
      // Create default template
      await fs.writeFile(this.templatePath, DEFAULT_TEMPLATE, 'utf8');
      this.template = DEFAULT_TEMPLATE;
    }
  }

  /**
   * Render article content with metadata using template
   */
  async render(content: string, metadata: PublishedMetadata): Promise<string> {
    // Format dates
    const createdAt = this.formatDateTime(metadata.created_at);
    const updatedAt = this.formatDate(metadata.updated_at);
    // published_at defaults to created_at if not set
    const publishedAt = this.formatDateTime(metadata.published_at || metadata.created_at);

    // Join keywords array
    const keywords = Array.isArray(metadata.keywords)
      ? metadata.keywords.join(', ')
      : String(metadata.keywords || '');

    // Prepare macros (escape title/description for YAML safety)
    const macros: Record<string, string> = {
      '{{META_TITLE}}': this.escapeYaml(metadata.title),
      '{{META_DESCRIPTION}}': this.escapeYaml(metadata.description || ''),
      '{{META_KEYWORDS}}': keywords,
      '{{META_CREATED_AT}}': createdAt,
      '{{META_UPDATED_AT}}': updatedAt,
      '{{META_PUBLISHED_AT}}': publishedAt,
      '{{META_VERSION}}': String(metadata.version || 1),
      '{{META_LAST_PIPELINE}}': metadata.last_pipeline || '',
      '{{CONTENT_MD}}': content,
      '{{FAQ_MD}}': metadata.faq || ''
    };

    return this.replaceMacrosInTemplate(this.template, macros);
  }

  /**
   * Escape string for YAML - handles quotes and special characters
   */
  private escapeYaml(str: string): string {
    if (!str) return '';
    // If contains double quotes, escape them
    if (str.includes('"')) {
      return str.replace(/"/g, '\\"');
    }
    return str;
  }

  /**
   * Format ISO date to YYYY-MM-DD HH:mm:ss
   */
  private formatDateTime(isoDate: string): string {
    if (!isoDate) return '';
    try {
      const date = new Date(isoDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return isoDate;
    }
  }

  /**
   * Format ISO date to YYYY-MM-DD
   */
  private formatDate(isoDate: string): string {
    if (!isoDate) return '';
    try {
      const date = new Date(isoDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return isoDate;
    }
  }

  /**
   * Replace macros in template with validation
   */
  private replaceMacrosInTemplate(
    template: string,
    macros: Record<string, string>
  ): string {
    let result = template;

    for (const [macro, value] of Object.entries(macros)) {
      if (!macro || macro.trim() === '') {
        throw new Error(`Macro is empty`);
      }

      if (value === null || value === undefined || typeof value !== 'string') {
        throw new Error(
          `Value for macro '${macro}' is invalid: "${JSON.stringify(value)}"`
        );
      }

      // Replace macro in template (escape special regex chars)
      const escapedMacro = macro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escapedMacro, 'g'), value);
    }

    // Verify no unreplaced macros remain
    this.verifyNoUnreplacedMacros(result);

    return result;
  }

  /**
   * Scan for unreplaced {{MACROS}} and throw if any found
   */
  private verifyNoUnreplacedMacros(content: string): void {
    if (content.indexOf('{{') === -1 && content.indexOf('}}') === -1) {
      return;
    }

    const REGEX_MACROS = /{{[A-Z0-9_]+}}/g;
    const unreplacedMacros = content.match(REGEX_MACROS);

    if (unreplacedMacros && unreplacedMacros.length > 0) {
      throw new Error(
        `Template has unreplaced macros:\n${unreplacedMacros.join('\n')}`
      );
    }
  }
}
