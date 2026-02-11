import { FastifyInstance } from 'fastify';
import { loadPipelinesConfig } from '../config/pipelines-config';

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
