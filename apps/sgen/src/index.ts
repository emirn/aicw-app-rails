import fastify from 'fastify';
import pino from 'pino';
import { config, validateRequiredConfig } from './config/server-config';
import dotenv from 'dotenv';
import articleRoutes from './routes/article';
import actionsRoutes from './routes/actions';
import planRoutes from './routes/plan';
import pipelinesRoutes from './routes/pipelines';
import cliRoutes from './routes/cli';
import imageRoutes from './routes/image';
import diagramRoutes from './routes/diagrams';
import projectRoutes from './routes/project';
import { validateActionConfig } from './config/action-config';
import { truncateError, truncateString } from './utils/log-truncate';
import { closeDiagramRenderer } from './utils/diagram-renderer';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

dotenv.config();

/**
 * Validate that required shared template files exist at startup.
 * Prevents runtime failures when enhancement modes need shared prompts.
 */
const validateRequiredTemplates = () => {
  const promptsDir = path.join(__dirname, '..', 'config', 'prompts');
  const required = [
    'shared/patch-mode-instructions.md',
    'shared/article_structure_requirement.md',
    'shared/voice_guidelines.md',
  ];

  const missing = required.filter(t => !existsSync(path.join(promptsDir, t)));
  if (missing.length > 0) {
    console.error('\n❌ SGEN STARTUP FAILED\n');
    console.error('Missing required template files:');
    missing.forEach(t => console.error(`  - config/prompts/${t}`));
    console.error('\nEnsure these files exist and restart.\n');
    process.exit(1);
  }
};

function buildLogger() {
  if (config.log.toFile) {
    // Ensure log directory exists before pino tries to write
    const logDir = path.dirname(config.log.file);
    if (logDir && logDir !== '.') {
      mkdirSync(logDir, { recursive: true });
    }
    const streams = [pino.destination(1), pino.destination(config.log.file)];
    return pino({ level: config.log.level }, pino.multistream(streams));
  }
  return true as any; // default Fastify pino logger to stdout
}

const app = fastify({
  logger: buildLogger(),
  bodyLimit: 52428800 // 50MB to support base64-encoded file assets
});

// Unified error handler to ensure JSON error responses
app.setErrorHandler((err, request, reply) => {
  const code = (err as any)?.statusCode || 500;
  const stack = (err as any)?.stack ? String((err as any).stack).split('\n').slice(0, 5).join('\n') : undefined;
  const truncatedErr = truncateError(err);
  app.log.error({ err: truncatedErr, msg: truncateString(err?.message || '', 500), code, stack }, 'unhandled:error');
  reply.status(code).send({ success: false, error: truncateString(err?.message || 'Internal Server Error', 500), error_details: stack });
});

app.register(articleRoutes, { prefix: '/api/v1/article' });
app.register(actionsRoutes, { prefix: '/api/v1/actions' });
app.register(planRoutes, { prefix: '/api/v1/plan' });
app.register(pipelinesRoutes, { prefix: '/api/v1/pipelines' });
app.register(cliRoutes, { prefix: '/api/v1/cli' });
app.register(imageRoutes, { prefix: '/api/v1/image' });
app.register(diagramRoutes, { prefix: '/api/v1/diagrams' });
app.register(projectRoutes, { prefix: '/api/v1/project' });

// Enhanced health check with dependency verification
app.get('/health', async (request, reply) => {
  const checks = {
    status: 'ok' as 'ok' | 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      config: !!(config.ai.apiKey || config.ai.openaiApiKey),
    },
  };

  if (!checks.checks.config) {
    checks.status = 'unhealthy';
    return reply.status(503).send(checks);
  }

  return checks;
});

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  app.log.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  try {
    // Stop accepting new requests
    await app.close();
    app.log.info('HTTP server closed');

    // Close diagram renderer (Puppeteer browser)
    await closeDiagramRenderer();
    app.log.info('Diagram renderer closed');

    app.log.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const start = async () => {
  try {
    // Validate required environment variables before starting
    try {
      validateRequiredConfig();
    } catch (err: any) {
      console.error('\n❌ SGEN STARTUP FAILED\n');
      console.error(err.message);
      console.error('\nSet the required environment variables and restart.\n');
      process.exit(1);
    }

    // Validate required shared templates exist (prevents runtime ENOENT errors)
    validateRequiredTemplates();

    // Validate action configs - crash if real actions have missing templates
    const validation = validateActionConfig(app.log as any);

    // Log any warnings (non-fatal)
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => app.log.warn({ warning: w }, 'Config warning'));
    }

    // Crash on errors (missing template files for real actions)
    if (!validation.valid) {
      app.log.error({ errors: validation.errors }, 'FATAL: Missing template files');
      console.error('\n❌ SGEN STARTUP FAILED\n');
      console.error('Missing template files for actions:');
      validation.errors.forEach(e => console.error(`  - ${e}`));
      console.error('\nFix the missing files and restart.\n');
      process.exit(1);
    }

    await app.listen({ port: config.server.port, host: config.server.host });
    app.log.info(`Server running`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
