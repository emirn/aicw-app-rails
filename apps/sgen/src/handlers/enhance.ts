/**
 * Enhance Handler
 *
 * Enhances article with AI improvements.
 * Returns: update_article operations
 */

import { ActionContext, ActionExecuteResponse, FileOperation } from './types';
import { IApiArticle, IArticle, IWebsiteInfo } from '@blogpostgen/types';
import { getArticleFromContext, buildArticleOperation, updateArticle } from './utils';
import { callAI } from '../services/ai.service';
import { ensureActionConfigForMode } from '../config/action-config';
import { buildUpdatePrompt } from '../utils/prompts';
import { mergeUpdate, MergeResult, parseLinePatches, applyPatches, extractContentText, parseTextReplacements, applyTextReplacements, fixCitationPattern, deduplicateReplacementsByUrl } from '../utils/articleUpdate';
import { cleanMarkdownUrls } from '../utils/url-cleaner';
import { config } from '../config/server-config';
import { loadPipelinesConfig } from '../config/pipelines-config';
import { extractMarkdownContent, needsNormalization } from '../utils/json-content-extractor';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveProjectMacros, resolveProjectMacrosInText } from '../utils/variables';
import { ensureNoUnreplacedMacros, requireBrandingColors } from '../utils/guards';
import { convertBase64ToWebp } from '../utils/webp-converter';

export async function handleEnhance(
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  const mode = flags.mode || 'improve_seo';

  // Check if batch mode
  if (flags.all && context.articles && context.articles.length > 0) {
    return handleEnhanceBatch(context, flags, log);
  }

  // Single article mode - get article from unified object
  const articleObj = getArticleFromContext(context);
  if (!articleObj?.content) {
    return {
      success: false,
      error: 'Article with content is required for enhancement',
      errorCode: 'MISSING_CONTENT',
      operations: [],
    };
  }

  if (!context.articlePath) {
    return {
      success: false,
      error: 'Article path is required',
      errorCode: 'MISSING_ARTICLE_PATH',
      operations: [],
    };
  }

  // Check last_pipeline against expected value from pipelines.json
  const pipelinesConfig = loadPipelinesConfig();
  const effectivePipelineName = flags.pipelineName || context.pipelineName;
  const pipelineConfig = effectivePipelineName ? pipelinesConfig.pipelines[effectivePipelineName] : null;
  const expectedLastPipeline = pipelineConfig?.articleFilter?.last_pipeline ?? 'generate';

  const currentPipeline = articleObj.last_pipeline || null;
  const isValidPipeline = currentPipeline === expectedLastPipeline;

  if (!isValidPipeline) {
    if (flags.force) {
      // Log warning when bypassing pipeline check with --force
      log.warn({
        path: context.articlePath,
        mode,
        last_pipeline: currentPipeline,
        expected: expectedLastPipeline,
      }, 'enhance:force:bypassing_pipeline_check');
    } else {
      return {
        success: false,
        error: `Article last_pipeline is '${currentPipeline}'. Expected: '${expectedLastPipeline}' (from pipeline '${effectivePipelineName}'). Use --force to override.`,
        errorCode: 'INVALID_LAST_PIPELINE',
        operations: [],
      };
    }
  }

  // Check if action was already applied (unless --force)
  // Return success with skipped=true so pipeline can continue to next action
  if (articleObj.applied_actions?.includes(mode)) {
    if (flags.force) {
      // Log warning when bypassing applied_actions check with --force
      log.warn({
        path: context.articlePath,
        mode,
        applied_actions: articleObj.applied_actions
      }, 'enhance:force:bypassing_applied_actions_check');
    } else {
      log.info({ path: context.articlePath, mode }, 'enhance:skipped (already applied)');
      return {
        success: true,  // Not an error - pipeline should continue
        message: `Skipped '${mode}' (already applied)`,
        skipped: true,  // Signal to CLI this was skipped
        operations: [],  // No changes needed
      };
    }
  }

  // Normalize JSON content if needed (fix articles with JSON in index.md)
  let normalizedContent = articleObj.content;
  let normalizedMeta = articleObj;
  if (normalizedContent && needsNormalization(normalizedContent)) {
    log.info({ path: context.articlePath }, 'enhance:normalizing_json_content');

    const extraction = extractMarkdownContent(normalizedContent, normalizedContent, log);

    if (extraction.success) {
      // Replace content with normalized version
      normalizedContent = extraction.content;

      // Merge extracted metadata (only if not already set)
      if (extraction.metadata) {
        normalizedMeta = {
          ...articleObj,
          content: normalizedContent,
          title: extraction.metadata.title || articleObj.title || '',
          description: extraction.metadata.description || articleObj.description || '',
          keywords: extraction.metadata.keywords || articleObj.keywords || [],
        };
      }

      log.info({
        strategy: extraction.strategy,
        contentLength: extraction.content.length
      }, 'enhance:normalized_json_to_markdown');
    } else {
      // Normalization failed - cannot enhance JSON content
      return {
        success: false,
        error: 'Article content is JSON format and could not be normalized to markdown',
        errorCode: 'JSON_NORMALIZATION_FAILED',
        operations: [],
      };
    }
  }

  // Actions that require website URL in project config
  const ACTIONS_REQUIRING_URL = ['add_content_jsonld', 'add_faq_jsonld'];

  if (ACTIONS_REQUIRING_URL.includes(mode) && !context.projectConfig?.url) {
    throw new Error(
      `Action '${mode}' requires a website URL. ` +
      `Please add "url" field to your project's index.json. ` +
      `Example: "url": "${context.projectName || 'example.com'}"`
    );
  }

  // Build article object for prompt builder
  const articlePath = context.articlePath || '';
  const article: IApiArticle = {
    id: `article-${randomUUID()}`,
    path: articlePath,
    title: normalizedMeta.title || 'Untitled',
    description: normalizedMeta.description || '',
    keywords: Array.isArray(normalizedMeta.keywords)
      ? normalizedMeta.keywords.join(', ')
      : (normalizedMeta.keywords as any) || '',
    content: normalizedContent || '',
  };

  // Normalize URL: add https:// if not present (supports both "example.com" and "https://example.com")
  const normalizeUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  };

  // Build website info (projectConfig is optional)
  const websiteInfo: IWebsiteInfo = {
    url: normalizeUrl(context.projectConfig?.url),
    title: context.projectConfig?.title || context.projectName || 'Untitled',
    description: '',
    focus_keywords: '',
    focus_instruction: '',
  };

  // Track prompt for history/debugging (set when AI is called)
  let prompt: string | undefined;

  try {
    // Guard add_links - requires related_articles context (run via interlinking pipeline)
    if (mode === 'add_links') {
      const relatedArticles = (context as any)?.related_articles;
      if (!relatedArticles || relatedArticles.length === 0) {
        return {
          success: false,
          error: 'add_links requires related_articles context. Use the interlinking pipeline separately.',
          errorCode: 'MISSING_CONTEXT',
          operations: [],
        };
      }
    }

    // Guard add_internal_links - requires sitemap_xml from CLI (passed via flags)
    const sitemapXml = flags.sitemap_xml || context.sitemap_xml;
    if (mode === 'add_internal_links') {
      if (!sitemapXml) {
        return {
          success: false,
          error: 'add_internal_links requires sitemap_xml. Ensure project has a valid URL with /sitemap.xml.',
          errorCode: 'MISSING_SITEMAP',
          operations: [],
        };
      }
    }

    const cfg = ensureActionConfigForMode(mode as any);
    const outMode = cfg?.output_mode || 'text_replace_all';

    // Handle no_ai actions locally (no AI call)
    if (cfg?.no_ai) {
      log.info({ path: context.articlePath, mode }, 'enhance:local_action');

      // Handle humanize_text_random locally
      if (mode === 'humanize_text_random') {
        const { applyRandomTypos, loadTyposFromCSV, DEFAULT_TYPO_CONFIG } = await import('../utils/random-typos');
        const typosPath = join(__dirname, '..', '..', 'config', 'actions', 'humanize_text_random', 'typos.csv');

        let csvContent = '';
        try {
          csvContent = readFileSync(typosPath, 'utf8');
        } catch {
          log.warn({ mode }, 'humanize_text_random: No typos.csv found, using algorithmic typos only');
        }

        const commonTypos = loadTyposFromCSV(csvContent);
        const rate = (context as any)?.typo_rate ?? DEFAULT_TYPO_CONFIG.rate;

        const { result, typosApplied } = applyRandomTypos(
          article.content || '',
          commonTypos,
          { rate }
        );

        // Build updated article (unified object)
        const updatedArticleObj = updateArticle(normalizedMeta, {
          content: result,
        });

        log.info({ path: context.articlePath, mode, typos_applied: typosApplied.length }, 'enhance:local_action:done');

        return {
          success: true,
          message: `Applied ${typosApplied.length} typos`,
          tokensUsed: 0,
          costUsd: 0,
          operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
        };
      }

      // Handle generate_image_hero (image generation via Recraft)
      if (mode === 'generate_image_hero') {
        const brandingColors = requireBrandingColors(
          (context.projectConfig as any)?.branding?.colors,
          'generate_image_hero'
        );
        const { generateRecraftImage } = await import('../services/recraft-image.service');
        const { replaceVariables } = await import('../utils/variables');

        // Get article description - required for image prompt
        const description = normalizedMeta.description;
        if (!description) {
          return {
            success: false,
            error: 'Article description is required for hero image generation. Check meta.md has a description field.',
            errorCode: 'MISSING_DESCRIPTION',
            operations: [],
          };
        }

        // Load prompt template
        const templatePath = join(__dirname, '..', '..', 'config', 'actions', 'generate_image_hero', 'prompt.md');
        let promptTemplate = readFileSync(templatePath, 'utf-8');

        // Check for custom prompt from project (passed via flags or context)
        if (flags.custom_prompt_template) {
          promptTemplate = flags.custom_prompt_template;
        }

        // Merge server config variables with custom variables from CLI
        // Also resolve {{project.*}} macros in colors from action config
        const serverCfg = cfg;
        const resolvedColors = resolveProjectMacros(
          (serverCfg as any)?.colors || {},
          context.projectConfig as unknown as Record<string, unknown>
        );
        const variables = { ...serverCfg?.variables, ...resolvedColors, ...flags.custom_variables };
        promptTemplate = replaceVariables(promptTemplate, variables);

        // Replace {{custom}} macro for actions with supports_custom_prompt
        if (cfg?.supports_custom_prompt) {
          const customPrompt = flags.custom_prompt ?? '';
          promptTemplate = promptTemplate.replace(/\{\{custom\}\}/gi, customPrompt);
        }

        // Extract headings from content for image prompt context
        const headings = (normalizedContent || '')
          .split('\n')
          .filter(line => /^##\s/.test(line))
          .map(line => line.replace(/^#+\s*/, '').trim())
          .slice(0, 5)
          .join(', ');

        // Replace article macros
        let imagePrompt = promptTemplate
          .replace(/\{\{DESCRIPTION\}\}/gi, description)
          .replace(/\{\{TITLE\}\}/gi, article.title)
          .replace(/\{\{KEYWORDS\}\}/gi, article.keywords || '')
          .replace(/\{\{CONTENT_EXCERPT\}\}/gi, headings);

        // Resolve {{project.*}} macros (e.g., {{project.branding.colors.primary}})
        imagePrompt = resolveProjectMacrosInText(
          imagePrompt,
          context.projectConfig as unknown as Record<string, unknown>
        );

        // Validate no unreplaced macros remain
        ensureNoUnreplacedMacros(imagePrompt, 'generate_image_hero');

        log.info({ path: context.articlePath, mode }, 'generate_image_hero:generating');

        try {
          const branding = (context.projectConfig as any)?.branding;
          const recraftStyle = branding?.illustration_style || 'digital_illustration/pastel_gradient';
          const generatedImage = await generateRecraftImage({
            prompt: imagePrompt,
            width: 1200,
            height: 630,
            style: recraftStyle,
            colors: brandingColors,
            log,
          });

          // Convert PNG from Recraft API to WebP
          const webpData = await convertBase64ToWebp(generatedImage.data);

          // Build file path for hero image with article path for website mirror structure
          // e.g., "assets/blog/my-post/hero.webp" for article at "blog/my-post"
          const heroFilename = 'hero.webp';
          const articlePath = context.articlePath || '';
          const heroPath = `assets/${articlePath}/${heroFilename}`;

          // Update article with image_hero path (unified object)
          const updatedArticleObj = updateArticle(normalizedMeta, {
            image_hero: `/${heroPath}`,
          });

          log.info({ path: context.articlePath, mode, costUsd: generatedImage.costUsd }, 'generate_image_hero:complete');

          return {
            success: true,
            message: `Generated hero image`,
            tokensUsed: 0,
            costUsd: generatedImage.costUsd,
            operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
            files: [{
              path: heroPath,
              content: webpData,  // base64 WebP
            }],
          };
        } catch (err) {
          log.error({ err, path: context.articlePath }, 'generate_image_hero:recraft_error');
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            errorCode: 'IMAGE_GENERATION_FAILED',
            operations: [],
          };
        }
      }

      // Handle generate_image_social (local Satori rendering)
      if (mode === 'generate_image_social') {
        requireBrandingColors(
          (context.projectConfig as any)?.branding?.colors,
          'generate_image_social'
        );
        const { SocialImageGenerator } = await import('../utils/social-image-generator');

        // Get article metadata
        const title = normalizedMeta.title;
        if (!title) {
          return {
            success: false,
            error: 'Article title is required for social image generation',
            errorCode: 'MISSING_TITLE',
            operations: [],
          };
        }

        // Read hero image if available (from previous generate_image_hero action)
        let heroImageBase64: string | undefined;
        const heroPath = normalizedMeta.image_hero;
        if (heroPath && flags.project_assets_dir) {
          try {
            const fullHeroPath = join(flags.project_assets_dir, heroPath.replace(/^\//, ''));
            const heroBuffer = readFileSync(fullHeroPath);
            const ext = heroPath.split('.').pop()?.toLowerCase() || 'png';
            const mimeType = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
            heroImageBase64 = `data:${mimeType};base64,${heroBuffer.toString('base64')}`;
          } catch {
            log.warn({ heroPath }, 'generate_image_social:hero_image_not_found');
          }
        }

        // Load custom config from project (passed via flags)
        const customConfig = flags.custom_variables || {};

        log.info({ path: context.articlePath, mode }, 'generate_image_social:generating');

        try {
          const generator = new SocialImageGenerator();
          generator.loadConfig({
            badge: customConfig.badge,
            brand_name: customConfig.brand_name || context.projectConfig?.title,
            gradient: customConfig.gradient,
          });

          const result = await generator.generate({
            title,
            description: normalizedMeta.description,
            heroImageBase64,
          });

          // Build file path: assets/<article-path>/og.webp
          const articlePath = context.articlePath || '';
          const ogPath = `assets/${articlePath}/og.webp`;

          // Update article with image_og path (unified object)
          const updatedArticleObj = updateArticle(normalizedMeta, {
            image_og: `/${ogPath}`,
          });

          log.info({ path: context.articlePath, mode }, 'generate_image_social:complete');

          return {
            success: true,
            message: 'Generated social preview image',
            tokensUsed: 0,
            costUsd: 0,  // Local rendering - no cost
            operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
            files: [{
              path: ogPath,
              content: result.buffer.toString('base64'),
            }],
          };
        } catch (err) {
          log.error({ err, path: context.articlePath }, 'generate_image_social:error');
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            errorCode: 'SOCIAL_IMAGE_GENERATION_FAILED',
            operations: [],
          };
        }
      }

      // Handle render_diagrams (mermaid → WebP rendering via Puppeteer)
      if (mode === 'render_diagrams') {
        const content = normalizedContent || '';

        // Check if there are any mermaid diagrams
        const mermaidRegex = /```mermaid\n[\s\S]*?```/g;
        const matches = content.match(mermaidRegex);

        if (!matches || matches.length === 0) {
          return {
            success: false,
            error: 'No mermaid diagrams found. Remove render_diagrams from pipeline or add diagrams to article.',
            errorCode: 'NO_DIAGRAMS',
            operations: [],
          };
        }

        const articlePath = context.articlePath || '';

        log.info({ path: articlePath, mode, diagrams: matches.length }, 'render_diagrams:start');

        try {
          const { getDiagramRenderer } = await import('../utils/diagram-renderer');
          const renderer = await getDiagramRenderer();
          const result = await renderer.processArticle(content, articlePath);

          // Report failures if any
          if (result.failures.length > 0) {
            log.warn({ failures: result.failures }, 'render_diagrams:partial_failures');

            if (result.assets.length === 0) {
              return {
                success: false,
                error: `All ${result.failures.length} diagram(s) failed to render`,
                errorCode: 'RENDER_FAILED',
                operations: [],
              };
            }
          }

          // Build updated article with rendered content
          const updatedArticleObj = updateArticle(normalizedMeta, {
            content: result.updatedContent,
          });

          // Convert assets to base64 files
          const files = result.assets.map(asset => ({
            path: `assets/${articlePath}/${asset.filename}`,
            content: asset.buffer.toString('base64'),
          }));

          log.info({
            path: articlePath,
            mode,
            rendered: result.assets.length,
            failed: result.failures.length,
          }, 'render_diagrams:complete');

          return {
            success: true,
            message: `Rendered ${result.assets.length} diagram(s)${result.failures.length > 0 ? `, ${result.failures.length} failed` : ''}`,
            tokensUsed: 0,
            costUsd: 0,
            operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
            files,
          };
        } catch (err) {
          log.error({ err, path: articlePath }, 'render_diagrams:error');
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            errorCode: 'RENDER_ERROR',
            operations: [],
          };
        }
      }

      // Fallback for unknown no_ai actions
      return {
        success: false,
        error: `Unknown no_ai action: ${mode}`,
        errorCode: 'UNKNOWN_LOCAL_ACTION',
        operations: [],
      };
    }

    // Handle humanize_text locally (CSV replacements + AI orthography fix)
    // This avoids the 24K char limit issue from embedding the full CSV in the prompt
    if (mode === 'humanize_text') {
      const { findSafeZones } = await import('../utils/random-typos');
      const csvPath = join(__dirname, '..', '..', 'config', 'actions', 'humanize_text', 'replacements.csv');

      // Load and parse CSV
      let csv = '';
      try { csv = readFileSync(csvPath, 'utf8'); } catch { }
      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lines = csv.split(/\r?\n/).filter(l => l.trim() && !/^\s*#/.test(l));
      const pairs: { from: string; to: string }[] = [];
      for (const line of lines) {
        const idx = line.indexOf(',');
        if (idx <= 0) continue;
        const from = line.slice(0, idx).trim().replace(/^"|"$/g, '');
        const to = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
        if (from) pairs.push({ from, to });
      }

      // Step 1: Apply CSV replacements with safe zones (longest first)
      pairs.sort((a, b) => b.from.length - a.from.length);
      let text = article.content || '';
      const safeZones = findSafeZones(text);

      for (const { from, to } of pairs) {
        const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
        text = text.replace(re, (match, offset) => {
          for (const zone of safeZones) {
            if (offset >= zone.start && offset < zone.end) return match;
          }
          // Support random variant selection with pipe syntax: "option1|option2|option3"
          if (to.includes('|')) {
            const variants = to.split('|');
            return variants[Math.floor(Math.random() * variants.length)];
          }
          return to;
        });
      }

      let changes = ['humanize_text (static CSV) applied'];
      let tokensUsed = 0;
      let costUsd = 0;

      // Step 2: AI orthography fix
      try {
        const fixPromptPath = join(__dirname, '..', '..', 'config', 'actions', 'humanize_text', 'fix_orthography.md');
        const { renderTemplateAbsolutePath } = await import('../utils/template');
        const prompt = renderTemplateAbsolutePath(fixPromptPath, { content: text });

        const cfg = ensureActionConfigForMode('humanize_text' as any);
        const provider = cfg?.ai_provider || 'openrouter';
        const modelId = cfg?.ai_model_id || config.ai.defaultModel;

        log.info({ path: context.articlePath, mode, action: 'fix_orthography' }, 'enhance:humanize_text:ai_start');
        const aiRes = await callAI(prompt, { provider, modelId, baseUrl: cfg?.ai_base_url });

        if (aiRes.content && typeof aiRes.content === 'string') {
          text = aiRes.content;
          changes.push('orthography fixed (AI)');
        }
        tokensUsed = aiRes.tokens || 0;
        costUsd = aiRes.usageStats.cost_usd || 0;
      } catch (e: any) {
        log.warn({ err: e }, 'enhance:humanize_text:orthography_fix_failed');
      }

      // Build updated article (unified object)
      const updatedArticleObj = updateArticle(normalizedMeta, {
        content: text,
      });

      const wordCount = text.split(/\s+/).length;
      log.info({ path: context.articlePath, mode, tokens: tokensUsed, cost_usd: costUsd, words: wordCount }, 'enhance:humanize_text:done');

      return {
        success: true,
        message: `Humanized article (${changes.join(', ')})`,
        tokensUsed,
        costUsd,
        operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
      };
    }

    // ============== LOCAL TOC GENERATION (NO AI) ==============
    if (mode === 'add_toc') {
      // Skip if toc already exists on the article
      if (normalizedMeta.toc && normalizedMeta.toc.trim()) {
        log.info({ path: context.articlePath, mode }, 'add_toc:skipped (toc already exists)');
        return {
          success: true,
          message: 'Skipped (toc already exists)',
          skipped: true,
          operations: [],
        };
      }

      const { generateTOCLocal } = await import('../utils/toc-generator');
      const tocResult = generateTOCLocal(article.content);

      if (tocResult.skipped) {
        log.info({ path: context.articlePath, mode }, 'add_toc:skipped (existing TOC found)');
        return {
          success: true,
          message: 'Skipped add_toc (existing TOC found)',
          skipped: true,
          operations: [],
        };
      }

      if (tocResult.headings.length === 0) {
        log.info({ path: context.articlePath, mode }, 'add_toc:no headings found');
        return {
          success: true,
          message: 'No headings found for TOC',
          tokensUsed: 0,
          costUsd: 0,
          operations: [],
        };
      }

      // Apply anchor replacements to content if any new anchors needed
      let updatedContent = article.content;
      let applied = 0;
      let skippedReplacements: string[] = [];
      if (tocResult.anchorReplacements.length > 0) {
        const replaceResult = applyTextReplacements(
          article.content,
          tocResult.anchorReplacements
        );
        updatedContent = replaceResult.result;
        applied = replaceResult.applied;
        skippedReplacements = replaceResult.skipped;
      }

      // Build updated article — always save toc HTML
      const updatedArticleObj = updateArticle(normalizedMeta, {
        content: updatedContent,
        toc: tocResult.tocHtml,
      });

      log.info({
        path: context.articlePath,
        mode,
        headings: tocResult.headings.length,
        anchorsAdded: applied,
        anchorsSkipped: skippedReplacements.length,
      }, 'add_toc:local applied');

      return {
        success: true,
        message: `Added TOC with ${tocResult.headings.length} headings (local, no AI)`,
        tokensUsed: 0,
        costUsd: 0,
        operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
      };
    }
    // ============== END LOCAL TOC GENERATION ==============

    // For add_faq_jsonld: skip if no FAQ content exists
    if (mode === 'add_faq_jsonld' && (!normalizedMeta.faq || !normalizedMeta.faq.trim())) {
      log.info({ path: context.articlePath, mode }, 'add_faq_jsonld:skipped (no faq content)');
      return { success: true, message: 'Skipped add_faq_jsonld (no FAQ content)', skipped: true, operations: [] };
    }

    // Build context with required variables
    const contextForPrompt: Record<string, unknown> = {
      website_info: websiteInfo,
      projectConfig: context.projectConfig,  // For resolving {{project.*}} macros in prompts
    };

    // For improve_seo: get keywords from article's meta
    if (mode === 'improve_seo') {
      contextForPrompt.target_keywords = normalizedMeta.keywords || [];
    }

    // For add_links: pass through related_articles from context
    if (mode === 'add_links') {
      contextForPrompt.related_articles = (context as any)?.related_articles || [];
    }

    // For add_internal_links: parse sitemap and pass links
    if (mode === 'add_internal_links' && sitemapXml) {
      const { parseSitemapForPrompt } = await import('../utils/sitemap-parser');
      const links = parseSitemapForPrompt(sitemapXml, websiteInfo.url || '');
      contextForPrompt.sitemap_links = links;
    }

    // For add_faq_jsonld: pass FAQ content for prompt
    if (mode === 'add_faq_jsonld') {
      contextForPrompt.faq_content = normalizedMeta.faq || '';
    }

    // For add_diagrams: merge server config variables with custom variables from CLI
    // Also resolve {{project.*}} macros in colors from action config
    if (mode === 'add_diagrams') {
      requireBrandingColors(
        (context.projectConfig as any)?.branding?.colors,
        'add_diagrams'
      );
      // Debug: trace projectConfig availability
      const projectConfig = context.projectConfig as unknown as Record<string, unknown>;
      log.info({
        hasProjectConfig: !!projectConfig,
        hasBranding: !!(projectConfig as any)?.branding,
        hasColors: !!(projectConfig as any)?.branding?.colors,
        cfgColors: Object.keys((cfg as any)?.colors || {}),
      }, 'enhance:add_diagrams:projectConfig_check');

      // Resolve colors using project config (e.g., {{project.branding.colors.primary}} -> "#1E40AF")
      const resolvedColors = resolveProjectMacros(
        (cfg as any)?.colors || {},
        projectConfig
      );

      log.info({ resolvedColors }, 'enhance:add_diagrams:resolved_colors');

      const variables = { ...cfg?.variables, ...resolvedColors, ...flags.custom_variables };
      contextForPrompt.variables = variables;
    }

    prompt = buildUpdatePrompt(article, mode, contextForPrompt, outMode);

    log.info({ path: context.articlePath, mode, output_mode: outMode }, 'enhance:start');

    const provider = cfg?.ai_provider || 'openrouter';
    const modelId = cfg?.ai_model_id || (provider === 'openai'
      ? config.ai.defaultModel.replace(/^openai\//, '')
      : config.ai.defaultModel);

    const { content, tokens, rawContent, usageStats } = await callAI(prompt, {
      provider,
      modelId,
      baseUrl: cfg?.ai_base_url,
      webSearch: cfg?.web_search,
    });

    // Handle output modes properly
    let updatedArticle: IApiArticle;
    if (outMode === 'insert_content') {
      const text = extractContentText(content, rawContent);
      const patches = parseLinePatches(text);
      if (patches.length > 0) {
        const patchResult = applyPatches(article.content, patches, {
          validateStructures: true,
          logger: (msg) => log.warn({ mode }, msg),
        });

        // Handle both string and ApplyPatchesResult return types
        const patched = typeof patchResult === 'string' ? patchResult : patchResult.content;

        // Log adjustments if any (patches moved to avoid breaking tables/lists)
        if (typeof patchResult === 'object' && patchResult.adjustments.length > 0) {
          log.warn({ mode, adjustments: patchResult.adjustments }, 'insert_content:patch_adjustments');
        }

        updatedArticle = { ...article, content: patched };
      } else {
        const mergeResult = mergeUpdate(article, mode, content, rawContent);
        if (mergeResult.rejected) {
          log.error({ path: context.articlePath, mode, reason: mergeResult.reason }, 'enhance:merge_rejected');
          return {
            success: false,
            error: `Enhancement ${mode} failed: ${mergeResult.reason}`,
            operations: [],
          };
        }
        updatedArticle = mergeResult.article;
      }
    } else if (outMode === 'insert_content_top') {
      const text = extractContentText(content, rawContent);
      const sep = article.content.startsWith('\n') || text.endsWith('\n') ? '' : '\n';
      updatedArticle = { ...article, content: `${text}${sep}${article.content}` };
    } else if (outMode === 'insert_content_bottom') {
      const text = extractContentText(content, rawContent);

      // Special handling for add_faq, add_content_jsonld, add_faq_jsonld: store in meta instead of content
      if (mode === 'add_faq') {
        // Store FAQ HTML in article.faq (unified object)
        const updatedArticleObj = updateArticle(normalizedMeta, {
          faq: text,
        });

        const wordCount = article.content.split(/\s+/).length;

        log.info({
          path: context.articlePath,
          mode,
          tokens,
          cost_usd: usageStats.cost_usd,
          words: wordCount,
        }, 'enhance:done (faq stored in meta)');

        return {
          success: true,
          message: `Added FAQ section (stored separately, ${wordCount} words in article)`,
          tokensUsed: tokens,
          costUsd: usageStats.cost_usd,
          prompt,
          rawResponse: flags.debug ? rawContent : undefined,
          operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
        };
      }

      if (mode === 'add_content_jsonld') {
        // Store content JSON-LD in article.content_jsonld (unified object)
        const updatedArticleObj = updateArticle(normalizedMeta, {
          content_jsonld: text,
        });

        const wordCount = article.content.split(/\s+/).length;

        log.info({
          path: context.articlePath,
          mode,
          tokens,
          cost_usd: usageStats.cost_usd,
          words: wordCount,
        }, 'enhance:done (content_jsonld stored in meta)');

        return {
          success: true,
          message: `Added content JSON-LD schema (stored separately, ${wordCount} words in article)`,
          tokensUsed: tokens,
          costUsd: usageStats.cost_usd,
          prompt,
          rawResponse: flags.debug ? rawContent : undefined,
          operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
        };
      }

      if (mode === 'add_faq_jsonld') {
        // Store FAQ JSON-LD in article.faq_jsonld (unified object)
        const updatedArticleObj = updateArticle(normalizedMeta, {
          faq_jsonld: text,
        });

        const wordCount = article.content.split(/\s+/).length;

        log.info({
          path: context.articlePath,
          mode,
          tokens,
          cost_usd: usageStats.cost_usd,
          words: wordCount,
        }, 'enhance:done (faq_jsonld stored in meta)');

        return {
          success: true,
          message: `Added FAQ JSON-LD schema (stored separately, ${wordCount} words in article)`,
          tokensUsed: tokens,
          costUsd: usageStats.cost_usd,
          prompt,
          rawResponse: flags.debug ? rawContent : undefined,
          operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
        };
      }

      // Default insert_content_bottom behavior for other modes
      const sep = article.content.endsWith('\n') || text.startsWith('\n') ? '' : '\n';
      updatedArticle = { ...article, content: `${article.content}${sep}${text}` };
    } else if (outMode === 'text_replace') {
      // Text replacement mode: AI returns { replacements: [{find, replace}] }
      let replacements = parseTextReplacements(content);

      // Fix OpenAI search model citation format for external links
      // Converts "text. ([domain](url))" to "[text](url)."
      if (mode === 'add_external_links') {
        replacements = replacements.map(r => ({
          ...r,
          replace: fixCitationPattern(r.replace)
        }));

        // Deduplicate URLs - AI sometimes returns same URL with different anchor text
        // This enforces "use each link only once" at code level
        const { deduplicated, removed } = deduplicateReplacementsByUrl(replacements);
        if (removed.length > 0) {
          log.warn({ mode, removed }, 'add_external_links:duplicate_urls_removed');
        }
        replacements = deduplicated;
      }

      if (replacements.length > 0) {
        const { result, applied, skipped } = applyTextReplacements(article.content, replacements);
        updatedArticle = { ...article, content: result };
        if (skipped.length > 0) {
          log.warn({ mode, skipped }, 'text_replace:some_replacements_not_found');
        }
        log.info({ mode, total: replacements.length, applied, skipped: skipped.length }, 'text_replace:applied');
      } else {
        // No replacements found - preserve original article (do NOT call mergeUpdate which destroys content)
        log.warn({ mode }, 'text_replace:no_replacements_found, preserving original article');
        updatedArticle = article;
      }
    } else {
      const mergeResult = mergeUpdate(article, mode, content, rawContent);
      if (mergeResult.rejected) {
        log.error({ path: context.articlePath, mode, reason: mergeResult.reason }, 'enhance:merge_rejected');
        return {
          success: false,
          error: `Enhancement ${mode} failed: ${mergeResult.reason}`,
          operations: [],
        };
      }
      updatedArticle = mergeResult.article;
    }

    // Clean external URLs - remove tracking params from AI-added links
    // but preserve project's own URL tracking for analytics
    const projectUrl = websiteInfo?.url;
    updatedArticle.content = cleanMarkdownUrls(updatedArticle.content, projectUrl);

    // Build updated article (unified object)
    // Note: last_pipeline stays 'generate' until the full enhance pipeline completes
    // The CLI will set last_pipeline: 'enhance' after all actions in the pipeline succeed
    // For create_meta mode, include extracted metadata fields
    const metaUpdates: Partial<IArticle> = {
      content: updatedArticle.content,
    };

    // For create_meta mode, copy extracted metadata from updatedArticle
    if (mode === 'create_meta') {
      if (updatedArticle.title) metaUpdates.title = updatedArticle.title;
      if (updatedArticle.description) metaUpdates.description = updatedArticle.description;
      if (updatedArticle.keywords) {
        // Convert comma-separated string back to array if needed
        metaUpdates.keywords = typeof updatedArticle.keywords === 'string'
          ? updatedArticle.keywords.split(',').map(k => k.trim()).filter(k => k)
          : updatedArticle.keywords as any;
      }
    }

    const updatedArticleObj = updateArticle(normalizedMeta, metaUpdates);

    const wordCount = updatedArticle.content.split(/\s+/).length;

    log.info({
      path: context.articlePath,
      mode,
      tokens,
      cost_usd: usageStats.cost_usd,
      words: wordCount,
    }, 'enhance:done');

    return {
      success: true,
      message: `Enhanced article with ${mode} (${wordCount} words)`,
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      prompt,  // Include for history tracking
      rawResponse: flags.debug ? rawContent : undefined,  // Include raw AI response when debug flag set
      operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
    };
  } catch (err: any) {
    log.error({ err, path: context.articlePath, mode, message: err?.message }, 'enhance:error');
    return {
      success: false,
      error: `Enhancement failed: ${err.message}`,
      errorCode: 'ENHANCEMENT_FAILED',
      prompt,  // Include for debugging failed calls
      operations: [],
    };
  }
}

/**
 * Handle batch enhancement for multiple articles
 */
async function handleEnhanceBatch(
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  const articles = context.articles || [];
  const limit = flags.limit || 0;
  const mode = flags.mode || 'improve_seo';

  // Filter to articles ready for enhancement using config-driven expected value
  const pipelinesConfig = loadPipelinesConfig();
  const effectivePipelineName = flags.pipelineName || context.pipelineName;
  const pipelineConfig = effectivePipelineName ? pipelinesConfig.pipelines[effectivePipelineName] : null;
  const expectedLP = pipelineConfig?.articleFilter?.last_pipeline ?? 'generate';

  const eligibleArticles = articles.filter((a) => {
    const lp = a.article.last_pipeline ?? null;
    return lp === expectedLP;
  });

  if (eligibleArticles.length === 0) {
    return {
      success: true,
      message: `No articles ready for enhancement (need last_pipeline: '${expectedLP}' for pipeline '${effectivePipelineName}').`,
      operations: [],
      batch: { total: 0, processed: 0, errors: [] },
    };
  }

  // Sort by created_at (oldest first - FIFO)
  const sortedArticles = [...eligibleArticles].sort((a, b) => {
    const dateA = new Date(a.article.created_at || 0).getTime();
    const dateB = new Date(b.article.created_at || 0).getTime();
    return dateA - dateB;
  });

  const toProcess = limit > 0 ? sortedArticles.slice(0, limit) : sortedArticles;

  log.info({ total: toProcess.length, mode, limit }, 'enhance:batch:start');

  const operations: FileOperation[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  let totalTokens = 0;
  let totalCost = 0;

  for (const batchArticle of toProcess) {
    const articleContext: ActionContext = {
      ...context,
      articlePath: batchArticle.path,
      article: batchArticle.article,
    };

    const result = await handleEnhance(articleContext, flags, log);

    if (result.success) {
      operations.push(...result.operations);
      totalTokens += result.tokensUsed || 0;
      totalCost += result.costUsd || 0;
    } else {
      errors.push({ path: batchArticle.path, error: result.error || 'Unknown error' });
    }
  }

  return {
    success: operations.length > 0 || errors.length === 0,
    message: `Enhanced ${operations.length}/${toProcess.length} article(s) with ${mode}`,
    tokensUsed: totalTokens,
    costUsd: totalCost,
    operations,
    batch: {
      total: toProcess.length,
      processed: operations.length,
      errors,
    },
  };
}
