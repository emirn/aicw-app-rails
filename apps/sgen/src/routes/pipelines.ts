import { FastifyInstance } from 'fastify';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';

interface PipelineAction {
  action: string;
}

interface ArticleFilter {
  last_pipeline: string | null;
}

interface PipelineConfig {
  description: string;
  needsProject: boolean;
  needsFileInput: boolean;
  articleFilter: ArticleFilter | null;
  actions: PipelineAction[];
}

interface PipelinesConfig {
  publishableFilter?: string;
  pipelines: Record<string, PipelineConfig>;
  updated_at: string;
}

// Cache with file modification time for auto-invalidation
interface CachedConfig {
  data: PipelinesConfig;
  mtime: number;
}

let pipelinesCache: CachedConfig | null = null;
const PIPELINES_CONFIG_PATH = join(__dirname, '..', '..', 'config', 'pipelines.json');

function loadPipelinesConfig(): PipelinesConfig {
  try {
    const stat = statSync(PIPELINES_CONFIG_PATH);
    const currentMtime = stat.mtimeMs;

    // Return cached config if file hasn't changed
    if (pipelinesCache && pipelinesCache.mtime === currentMtime) {
      return pipelinesCache.data;
    }

    // Reload config
    const content = readFileSync(PIPELINES_CONFIG_PATH, 'utf-8');
    const data = JSON.parse(content) as PipelinesConfig;
    pipelinesCache = { data, mtime: currentMtime };
    return data;
  } catch (error) {
    // Return default config if file not found
    console.warn('Failed to load pipelines.json, using defaults');
    return {
      pipelines: {
        default: {
          description: 'Default pipeline',
          needsProject: true,
          needsFileInput: false,
          articleFilter: { last_pipeline: 'generate' },
          actions: [
            { action: 'humanize_text' },
            { action: 'improve_seo' },
            { action: 'create_meta' }
          ]
        }
      },
      updated_at: 'fallback'
    };
  }
}

export default async function pipelinesRoutes(app: FastifyInstance) {
  // GET /pipelines - list all available pipelines with full config
  app.get('/', async () => {
    const config = loadPipelinesConfig();
    return {
      success: true,
      publishableFilter: config.publishableFilter || null,
      pipelines: Object.entries(config.pipelines).map(([name, pipeline]) => ({
        name,
        description: pipeline.description,
        needsProject: pipeline.needsProject,
        needsFileInput: pipeline.needsFileInput,
        articleFilter: pipeline.articleFilter,
        action_count: pipeline.actions.length
      })),
      updated_at: config.updated_at
    };
  });

  // GET /pipelines/:name - get a specific pipeline configuration
  app.get<{ Params: { name: string } }>('/:name', async (request, reply) => {
    const { name } = request.params;
    const config = loadPipelinesConfig();

    if (!config.pipelines[name]) {
      reply.code(404);
      return {
        success: false,
        error: `Pipeline '${name}' not found`,
        available: Object.keys(config.pipelines)
      };
    }

    return {
      success: true,
      name,
      ...config.pipelines[name]
    };
  });

  // GET /pipelines/config - get the full pipelines configuration
  app.get('/config', async () => {
    const config = loadPipelinesConfig();
    return {
      success: true,
      config
    };
  });
}
