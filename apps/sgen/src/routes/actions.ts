import { FastifyInstance } from 'fastify';
import { ACTION_CONFIG, validateActionConfig } from '../config/action-config';

export default async function actionsRoutes(app: FastifyInstance) {
  // GET /api/v1/actions - List all actions with metadata
  app.get('/', async () => {
    const actions = Object.entries(ACTION_CONFIG).map(([name, cfg]) => ({
      name,
      description: cfg?.description || '',
      forcible: cfg?.forcible !== false, // default true
      output_mode: cfg?.output_mode,
      no_ai: cfg?.no_ai || false,
    }));
    return { success: true, actions };
  });

  app.get('/config', async () => ({ success: true, config: ACTION_CONFIG }));

  app.get('/validate', async () => {
    const warnings: any[] = [];
    const logger = { warn: (o: any, msg: string) => warnings.push({ msg, ...o }) } as any;
    validateActionConfig(logger);
    return { success: true, warnings };
  });
}

