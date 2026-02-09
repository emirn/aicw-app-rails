import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Default template for published articles
 * All macros map 1:1 to article JSON field names
 */
const DEFAULT_TEMPLATE = `---
updated_at: {{updated_at}}
published_at: {{published_at}}
title: "{{title}}"
description: "{{description}}"
og_title: "{{title}}"
og_description: "{{description}}"
twitter_title: "{{title}}"
twitter_description: "{{description}}"
breadcrumbs: "Home/Blog/{{title}}"
things: "{{keywords}}"
keywords: "{{keywords}}"
---

{{toc}}

{{content_jsonld}}

{{content}}

{{faq_jsonld}}

{{faq}}
`;

const TEMPLATE_FILENAME = 'template_published.md';

const MACRO_REGEX = /\{\{([a-z_][a-z0-9_.]*)\}\}/g;

/**
 * Resolve a dot-notation field path against a data object.
 * e.g. resolveFieldPath({a: {b: 1}}, "a.b") => 1
 */
function resolveFieldPath(data: Record<string, any>, path: string): any {
  return path.split('.').reduce((obj, key) => obj?.[key], data);
}

/**
 * Published article renderer
 *
 * Renders articles from ready/ to published/ format using a per-project template.
 * All {{macro}} patterns are resolved dynamically from article data fields.
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
      await fs.writeFile(this.templatePath, DEFAULT_TEMPLATE, 'utf8');
      this.template = DEFAULT_TEMPLATE;
    }
  }

  /**
   * Render article using template with dynamic macro resolution.
   * Every {{field_name}} is looked up directly in articleData.
   * Dot notation supported for nested fields.
   * Arrays of primitives auto-join with ", ".
   */
  async render(articleData: Record<string, any>): Promise<string> {
    let result = this.template;

    // Collect all unique macros from template
    const macros = new Set<string>();
    let match;
    while ((match = MACRO_REGEX.exec(result)) !== null) {
      macros.add(match[1]);
    }

    // Resolve and replace each macro
    for (const fieldPath of macros) {
      const value = resolveFieldPath(articleData, fieldPath);

      if (value === undefined || value === null) {
        throw new Error(`Template macro '{{${fieldPath}}}' refers to missing article field '${fieldPath}'`);
      }

      let stringValue: string;
      if (typeof value === 'string') {
        if (!value.trim()) {
          throw new Error(`Template macro '{{${fieldPath}}}' refers to empty article field '${fieldPath}'`);
        }
        stringValue = value;
      } else if (Array.isArray(value)) {
        stringValue = value.join(', ');
        if (!stringValue.trim()) {
          throw new Error(`Template macro '{{${fieldPath}}}' refers to empty array field '${fieldPath}'`);
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        stringValue = String(value);
      } else {
        throw new Error(`Template macro '{{${fieldPath}}}' refers to non-scalar field '${fieldPath}' (use dot notation for nested objects)`);
      }

      // Replace all occurrences — escape dots in field path for regex
      const escaped = fieldPath.replace(/\./g, '\\.');
      result = result.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, 'g'), stringValue);
    }

    return result;
  }
}
