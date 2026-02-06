import { FastifyInstance } from 'fastify';
import { getDiagramRenderer } from '../utils/diagram-renderer';

/**
 * Request body for diagram rendering endpoint
 */
interface DiagramRenderRequest {
  content: string;
  article_path: string;
}

/**
 * JSON Schema for request validation
 */
const renderSchema = {
  body: {
    type: 'object',
    required: ['content', 'article_path'],
    properties: {
      content: { type: 'string', minLength: 1 },
      article_path: { type: 'string', minLength: 1, pattern: '^[a-zA-Z0-9/_-]+$' }
    }
  }
};

/**
 * Asset in the response
 */
interface DiagramRenderAsset {
  path: string;
  base64: string;
  alt_text: string;
  diagram_type: string;
}

/**
 * Failure info in the response
 */
interface DiagramRenderFailure {
  index: number;
  mermaid_code: string;
  error: string;
}

/**
 * Response for diagram rendering endpoint
 */
interface DiagramRenderResponse {
  success: boolean;
  updated_content?: string;
  assets?: DiagramRenderAsset[];
  failures?: DiagramRenderFailure[];
  render_time_ms?: number;
  error?: string;
}

/**
 * Diagrams routes - endpoints for rendering Mermaid diagrams to PNG
 */
export default async function diagramRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/diagrams/render
   *
   * Render all Mermaid code blocks in content to PNG images.
   * Returns base64-encoded images and updated content with image references.
   *
   * Request body:
   * {
   *   content: string,       // Markdown content with ```mermaid code blocks
   *   article_path: string   // Path for asset storage (e.g., 'blog/my-article')
   * }
   *
   * Response:
   * {
   *   success: true,
   *   updated_content: string,  // Content with mermaid blocks replaced by image refs
   *   assets: [{
   *     path: string,           // Where CLI should save (e.g., 'assets/blog/my-article/diagram.png')
   *     base64: string,         // Base64-encoded PNG data
   *     alt_text: string,       // Alt text extracted from nearest heading
   *     diagram_type: string    // flowchart, sequence, etc.
   *   }],
   *   failures: [{              // Any diagrams that failed to render
   *     index: number,
   *     mermaid_code: string,   // Truncated to 100 chars
   *     error: string
   *   }],
   *   render_time_ms: number
   * }
   */
  app.post<{
    Body: DiagramRenderRequest;
    Reply: DiagramRenderResponse;
  }>('/render', { schema: renderSchema }, async (request, reply) => {
    const startTime = Date.now();
    const { content, article_path } = request.body;

    try {
      const renderer = await getDiagramRenderer();
      const result = await renderer.processArticle(content, article_path);

      const response: DiagramRenderResponse = {
        success: true,
        updated_content: result.updatedContent,
        assets: result.assets.map(a => ({
          path: `assets/${article_path}/${a.filename}`,
          base64: a.buffer.toString('base64'),
          alt_text: a.altText,
          diagram_type: a.diagramType
        })),
        failures: result.failures.map(f => ({
          index: f.index,
          mermaid_code: f.mermaidCode,
          error: f.error
        })),
        render_time_ms: Date.now() - startTime
      };

      return response;
    } catch (error) {
      app.log.error({ err: error }, 'Diagram rendering failed');
      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        render_time_ms: Date.now() - startTime
      };
    }
  });
}
