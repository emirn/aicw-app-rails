import { IApiArticle, IPage, IWebsiteInfo, ActionMode, OutputMode, IPromptParts } from '../types';
import { IArticle } from '@blogpostgen/types';
import { renderTemplateFile, renderTemplateAbsolutePath, renderTemplate } from './template';
import { ensurePromptOK, ensureNoUnreplacedMacros } from './guards';
import { ACTION_CONFIG } from '../config/action-config';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { resolveProjectMacrosInText } from './variables';

/**
 * Build the article generation prompt
 *
 * @param description - Article topic/brief
 * @param websiteInfo - Website configuration
 * @param promptParts - Required custom prompt parts from project config
 * @param articleMeta - Optional article metadata from meta.md (title, keywords, description)
 * @param customTemplate - Optional custom prompt template (from project config)
 * @param customContent - Optional custom.md content (from project config override or default)
 */
export const buildArticlePrompt = (
  description: string,
  websiteInfo: IWebsiteInfo,
  promptParts: IPromptParts,
  articleMeta?: IArticle,
  customTemplate?: string,
  customContent?: string,
  articlePath?: string
): string => {
  const cfg = ACTION_CONFIG['write_draft'];

  // Load custom.md content for {{custom}} variable
  // Priority: 1) customContent (from CLI/project), 2) default action folder custom.md
  let custom = customContent || '';
  if (!custom && cfg?.prompt_path) {
    const defaultCustomPath = join(dirname(cfg.prompt_path), 'custom.md');
    if (existsSync(defaultCustomPath)) {
      custom = readFileSync(defaultCustomPath, 'utf-8');
    }
  }

  // Build template variables including article-specific metadata
  const vars: Record<string, unknown> = {
    website_title: websiteInfo.title,
    requirements: promptParts.project_requirements,
    // Custom content for brand style customization
    custom: custom,
    // Article metadata from meta.md - helps AI target specific title/keywords
    title: articleMeta?.title || '(use topic from brief)',
    keywords: articleMeta?.keywords?.join(', ') || '(derive from topic)',
    content: articleMeta?.content || description,  // article.content = the brief
    path: articlePath || '(path not set)',
  };

  // Use custom template if provided, otherwise use server default
  if (customTemplate) {
    const prompt = renderTemplate(customTemplate, vars);
    ensurePromptOK(prompt);
    ensureNoUnreplacedMacros(prompt, 'write_draft');
    return prompt;
  }

  // Always load from prompt_path (prompt.md)
  const promptPath = cfg?.prompt_path;
  if (!promptPath || !existsSync(promptPath)) {
    throw new Error('write_draft prompt.md not found');
  }

  const prompt = renderTemplateAbsolutePath(promptPath, vars);
  ensurePromptOK(prompt);
  ensureNoUnreplacedMacros(prompt, 'write_draft');
  return prompt;
};

export const buildUpdatePrompt = (
  article: IApiArticle,
  mode: ActionMode,
  context?: any,
  outputMode: OutputMode = 'text_replace_all'
): string => {
  const patchSuffix =
    outputMode === 'insert_content'
      ? '\n\n' + renderTemplateFile('shared/patch-mode-instructions.md', {})
      : '';

  const cfg = ACTION_CONFIG[mode];

  // Common variables
  let vars: Record<string, unknown> = { content: article.content };

  // Merge custom variables (e.g., brand colors) BEFORE rendering
  // These need to be available when renderTemplateAbsolutePath runs
  if (context?.variables) {
    vars = { ...vars, ...context.variables };
  }

  if (mode === 'add_links') {
    const links = (context?.related_articles as IPage[] | undefined)
      ?.map((p) => `- [${p.title}](${p.slug})`)
      .join('\n') || '';
    vars.links = links;
  }
  if (mode === 'add_internal_links') {
    // Links from parsed sitemap, passed via context.sitemap_links
    const links = (context?.sitemap_links as Array<{ slug: string; title: string }> | undefined)
      ?.map((l) => `- [${l.title}](${l.slug})`)
      .join('\n') || '';
    vars.links = links;
  }
  if (mode === 'improve_seo') {
    vars.keywords = (context?.target_keywords as string[] | undefined)?.join(', ') || '';
  }
  if (mode === 'condense_text') {
    vars.percent_reduction = context?.percent_reduction ?? 20;  // Default 20%
  }
  if (mode === 'humanize_text') {
    if (typeof context?.replacements === 'string') {
      vars.replacements = context.replacements;
    }
  }
  if (mode === 'add_content_jsonld') {
    const websiteInfo = context?.website_info as IWebsiteInfo | undefined;
    vars.website_url = websiteInfo?.url || '';
    vars.article_slug = article.slug || '';
    vars.organization_name = websiteInfo?.title || 'Organization';
  }
  if (mode === 'add_faq_jsonld') {
    const websiteInfo = context?.website_info as IWebsiteInfo | undefined;
    vars.website_url = websiteInfo?.url || '';
    vars.article_slug = article.slug || '';
    vars.faq_content = context?.faq_content || '';
  }

  // Use prompt_path if available, otherwise fall back to renderTemplateFile
  const promptPath = cfg?.prompt_path;
  let prompt: string;
  if (promptPath && existsSync(promptPath)) {
    prompt = renderTemplateAbsolutePath(promptPath, vars) + patchSuffix;
  } else {
    // Fallback for legacy/testing
    prompt = renderTemplateFile(`actions/${mode}.md`, vars) + patchSuffix;
  }

  // Resolve {{project.*}} macros if projectConfig is available
  // This handles templates that use {{project.branding.colors.primary}} etc.
  if (context?.projectConfig) {
    prompt = resolveProjectMacrosInText(prompt, context.projectConfig);
  }

  ensurePromptOK(prompt);
  ensureNoUnreplacedMacros(prompt, mode);
  return prompt;
};
