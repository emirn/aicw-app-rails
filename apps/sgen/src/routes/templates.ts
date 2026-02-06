import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Templates routes - serves default templates for project initialization
 */
export default async function templateRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/templates/default-requirements
   * Returns the default prompts/write_draft/prompt.md template for new projects
   */
  app.get('/default-requirements', async (request, reply) => {
    try {
      const templatePath = join(__dirname, '..', '..', 'config', 'actions', 'write_draft', 'custom.md');
      const content = readFileSync(templatePath, 'utf-8');
      return {
        success: true,
        template: content,
      };
    } catch (err: any) {
      app.log.error({ err }, 'Failed to read default-requirements template');
      reply.code(500);
      return {
        success: false,
        error: 'Failed to read default template',
      };
    }
  });

  /**
   * GET /api/v1/templates/default-hero-prompt
   * Returns the default hero image prompt template with color macros.
   * CLI/app checks if local prompt exists, if not, fetches and saves this template.
   */
  app.get('/default-hero-prompt', async (request, reply) => {
    try {
      const templatePath = join(__dirname, '..', '..', 'config', 'actions', 'generate_image_hero', 'prompt.md');
      const content = readFileSync(templatePath, 'utf-8');
      return {
        success: true,
        template: content,
      };
    } catch (err: any) {
      app.log.error({ err }, 'Failed to read default-hero-prompt template');
      reply.code(500);
      return {
        success: false,
        error: 'Failed to read default hero prompt template',
      };
    }
  });

  /**
   * GET /api/v1/templates/project
   * Returns the default project template (index.json) for new projects.
   * Contains default branding settings including badge, brand_name, and colors.
   */
  app.get('/project', async (request, reply) => {
    try {
      const templatePath = join(__dirname, '..', '..', 'config', 'templates', 'project', 'config', 'index.json');
      const content = readFileSync(templatePath, 'utf-8');
      const template = JSON.parse(content);
      return {
        success: true,
        template,
      };
    } catch (err: any) {
      app.log.error({ err }, 'Failed to read project template');
      reply.code(500);
      return {
        success: false,
        error: 'Failed to read project template',
      };
    }
  });
}
