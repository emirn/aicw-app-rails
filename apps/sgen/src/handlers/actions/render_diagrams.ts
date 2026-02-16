/**
 * render_diagrams action handler
 *
 * Renders mermaid diagrams in article content to WebP images.
 * Uses Puppeteer-based diagram renderer.
 */

import { ActionHandlerFn } from './types';
import { buildArticleOperation, updateArticle } from '../utils';

export const handle: ActionHandlerFn = async ({ normalizedMeta, context, log }) => {
  const content = normalizedMeta.content || '';

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

  log.info({ path: articlePath, mode: 'render_diagrams', diagrams: matches.length }, 'render_diagrams:start');

  try {
    const { getDiagramRenderer } = await import('../../utils/diagram-renderer');
    const renderer = await getDiagramRenderer();
    const result = await renderer.processArticle(content, articlePath);

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

    const updatedArticleObj = updateArticle(normalizedMeta, {
      content: result.updatedContent,
    });

    const files = result.assets.map(asset => ({
      path: `assets/${articlePath}/${asset.filename}`,
      content: asset.buffer.toString('base64'),
    }));

    log.info({
      path: articlePath,
      mode: 'render_diagrams',
      rendered: result.assets.length,
      failed: result.failures.length,
    }, 'render_diagrams:complete');

    return {
      success: true,
      message: `Rendered ${result.assets.length} diagram(s)${result.failures.length > 0 ? `, ${result.failures.length} failed` : ''}`,
      tokensUsed: 0,
      costUsd: 0,
      operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, 'render_diagrams')],
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
};
