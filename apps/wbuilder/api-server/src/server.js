import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildAstroSite } from './astro-builder.js';
import { deployToCloudflarePages } from './cloudflare-pages.js';
import { addCustomDomain, listCustomDomains, removeCustomDomain } from './cloudflare-api.js';
import { validateDomain, getSitesHostname } from './utils/normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// Version info (commit set at build time via Docker ARG)
const VERSION = pkg.version;
const COMMIT = process.env.BUILD_COMMIT || 'dev';

const app = Fastify({ logger: true });
await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 10 // Max 10 files per request
  }
});

// Config
const API_KEY = process.env.AICW_WEBSITE_BUILD_API_KEY;

// Paths are hardcoded based on environment:
// - Production (Docker): /data/aicw_wb_data and /app/templates
// - Local dev: ./aicw_wb_data and ../templates (relative to api-server)
const isProduction = process.env.NODE_ENV === 'production';
const DATA_DIR = isProduction ? '/data/aicw_wb_data' : path.resolve(__dirname, '../aicw_wb_data');
const TEMPLATES_DIR = isProduction ? '/app/templates' : path.resolve(__dirname, '../../templates');

// Ensure data directory exists
await fs.mkdir(DATA_DIR, { recursive: true });

// Path traversal protection
function sanitizePath(input, allowedChars = /^[a-zA-Z0-9_-]+$/) {
  if (!input || typeof input !== 'string') return null;
  if (!allowedChars.test(input)) return null;
  if (input.includes('..') || input.includes('/') || input.includes('\\')) return null;
  return input;
}

function sanitizeFilename(input) {
  if (!input || typeof input !== 'string') return null;
  // Only allow safe filename characters, must end with .md for articles
  const basename = path.basename(input);
  if (basename !== input) return null; // Had path components
  if (!/^[a-zA-Z0-9_.-]+$/.test(basename)) return null;
  return basename;
}

/**
 * Sanitize a nested file path (e.g., "assets/guide/article-name/hero.png")
 * Blocks path traversal attacks while allowing nested directories
 */
function sanitizeNestedPath(filepath) {
  if (!filepath || typeof filepath !== 'string') return null;

  // Split path and filter out dangerous components
  const parts = filepath.split('/').filter(p => {
    if (!p) return false; // Empty segments
    if (p === '..') return false; // Parent directory traversal
    if (p.includes('..')) return false; // Hidden traversal attempts
    if (p.startsWith('.') && p !== '.') return false; // Hidden files/dirs (except current)
    return true;
  });

  if (parts.length === 0) return null;

  // Validate each part contains only safe characters
  for (const part of parts) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(part)) return null;
  }

  return parts.join('/');
}

// Simple auth middleware
app.addHook('preHandler', async (req, reply) => {
  if (req.url === '/health') return;
  const key = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!key || key !== API_KEY) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
});

// Health check - includes version for deployment verification
app.get('/health', async () => ({
  status: 'ok',
  version: VERSION,
  commit: COMMIT,
  timestamp: new Date().toISOString()
}));

/**
 * POST /jobs - Create a build job
 *
 * Two modes:
 * 1. DRAFT MODE (recommended for many articles):
 *    - Omit "articles" to create a draft job
 *    - Upload articles via POST /jobs/:jobId/articles
 *    - Start build via POST /jobs/:jobId/start
 *
 * 2. IMMEDIATE MODE (for small payloads):
 *    - Include "articles" array to build immediately
 *
 * Body:
 * {
 *   "template": "default",
 *   "siteId": "my-blog",
 *   "cloudflareProjectName": "my-blog",
 *   "config": { ... },
 *   "articles": [...] // Optional - omit for draft mode
 * }
 */
app.post('/jobs', async (req, reply) => {
  const {
    template = 'default',
    siteId,
    cloudflareProjectName,
    publishTarget = 'cloudflare',
    config,
    articles,
    sessionId: callerSessionId
  } = req.body;

  // Session ID: accept from caller (e.g., Rails job ID) or auto-generate
  const sessionId = callerSessionId || nanoid(8);

  if (!siteId) {
    return reply.code(400).send({ error: 'siteId is required' });
  }

  if (!['cloudflare', 'folder'].includes(publishTarget)) {
    return reply.code(400).send({ error: 'publishTarget must be "cloudflare" or "folder"' });
  }

  if (publishTarget === 'cloudflare' && !cloudflareProjectName) {
    return reply.code(400).send({ error: 'cloudflareProjectName is required when publishTarget is "cloudflare"' });
  }

  // Validate siteId (path traversal protection)
  const safeSiteId = sanitizePath(siteId);
  if (!safeSiteId) {
    return reply.code(400).send({ error: 'Invalid siteId. Must contain only alphanumeric characters, underscores, and hyphens.' });
  }

  // Validate template (path traversal protection)
  const safeTemplate = sanitizePath(template);
  if (!safeTemplate) {
    return reply.code(400).send({ error: 'Invalid template name. Must contain only alphanumeric characters, underscores, and hyphens.' });
  }

  // Validate template exists
  const templateDir = path.join(TEMPLATES_DIR, safeTemplate);
  try {
    await fs.access(templateDir);
  } catch {
    return reply.code(400).send({ error: `Template "${template}" not found` });
  }

  const jobId = `${safeSiteId}_${nanoid(8)}`;
  const jobDir = path.join(DATA_DIR, jobId);
  const articlesDir = path.join(jobDir, 'articles');
  const imagesDir = path.join(jobDir, 'images');

  // Create job directories
  await fs.mkdir(articlesDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });

  // Save input (without articles - they're stored separately)
  const inputData = { template: safeTemplate, siteId: safeSiteId, cloudflareProjectName, publishTarget, config, sessionId };
  await fs.writeFile(path.join(jobDir, 'input.json'), JSON.stringify(inputData, null, 2));

  // If articles provided, save them and start build immediately
  if (articles && articles.length > 0) {
    for (const article of articles) {
      const rawFilename = article.filename || `article-${nanoid(6)}.md`;
      const filename = sanitizeFilename(rawFilename);
      if (!filename) {
        return reply.code(400).send({ error: `Invalid filename: ${rawFilename}` });
      }
      const content = article.encoding === 'base64'
        ? Buffer.from(article.content, 'base64').toString('utf8')
        : article.content;
      await fs.writeFile(path.join(articlesDir, filename), content);
    }

    await writeStatus(jobDir, 'queued', 'Job created with articles');
    runBuild(jobId, jobDir, templateDir, sessionId);

    return reply.code(202).send({
      jobId,
      sessionId,
      status: 'queued',
      mode: 'immediate',
      articlesCount: articles.length
    });
  }

  // No articles - create draft job
  await writeStatus(jobDir, 'draft', 'Job created in draft mode - upload articles then start');

  return reply.code(201).send({
    jobId,
    status: 'draft',
    mode: 'draft',
    message: 'Upload articles via POST /jobs/:jobId/articles, then start via POST /jobs/:jobId/start'
  });
});

/**
 * POST /jobs/:jobId/articles - Upload an article to a draft job
 *
 * Supports three formats:
 *
 * 1. BlogPostGen JSON format (recommended):
 *    {
 *      "slug": "guide/wikipedia-visibility",
 *      "meta": {
 *        "title": "Article Title",
 *        "description": "Article description...",
 *        "keywords": ["keyword1", "keyword2"],
 *        "created_at": "2026-01-13T14:27:41.710Z",
 *        "updated_at": "2026-01-13T16:36:05.680Z",
 *        "published_at": "2026-01-15",
 *        "image_hero": "/assets/guide/article/hero.png",
 *        "image_og": "/assets/og-img/guide/article.png"
 *      },
 *      "content": "## Markdown content here..."
 *    }
 *
 * 2. Legacy JSON (application/json):
 *    {
 *      "filename": "my-article.md",
 *      "content": "---\ntitle: ...\n---\n# Content",
 *      "encoding": "utf8" | "base64"
 *    }
 *
 * 3. Multipart (multipart/form-data):
 *    - article: markdown file
 *    - images: optional image files (will be placed in /images/)
 *    - metadata: optional JSON with slug, etc.
 */
app.post('/jobs/:jobId/articles', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);
  const articlesDir = path.join(jobDir, 'articles');
  const imagesDir = path.join(jobDir, 'images');

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  const status = await readStatus(jobDir);
  if (status.status !== 'draft') {
    return reply.code(409).send({
      error: 'Can only upload articles to draft jobs',
      currentStatus: status.status
    });
  }

  const contentType = req.headers['content-type'] || '';

  // Handle multipart form data
  if (contentType.includes('multipart/form-data')) {
    const parts = req.parts();
    let articleFilename = null;
    let articleContent = null;
    const uploadedImages = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();

        if (part.fieldname === 'article') {
          const safeFilename = sanitizeFilename(part.filename);
          if (!safeFilename) {
            return reply.code(400).send({ error: `Invalid article filename: ${part.filename}` });
          }
          articleFilename = safeFilename;
          articleContent = buffer.toString('utf8');
        } else if (part.fieldname === 'images' || part.fieldname.startsWith('image')) {
          const safeImageName = sanitizeFilename(part.filename);
          if (!safeImageName) {
            return reply.code(400).send({ error: `Invalid image filename: ${part.filename}` });
          }
          const imagePath = path.join(imagesDir, safeImageName);
          await fs.writeFile(imagePath, buffer);
          uploadedImages.push({
            filename: safeImageName,
            path: `/images/${safeImageName}`,
            size: buffer.length
          });
        }
      }
    }

    if (!articleContent) {
      return reply.code(400).send({ error: 'No article file provided' });
    }

    await fs.writeFile(path.join(articlesDir, articleFilename), articleContent);

    return {
      message: 'Article uploaded',
      article: articleFilename,
      images: uploadedImages
    };
  }

  // Handle JSON body - detect BlogPostGen format vs legacy format
  const body = req.body;

  // BlogPostGen format: has slug, meta, and content
  if (body.slug && body.meta && body.content !== undefined) {
    const { slug, meta, content } = body;

    // Validate slug
    if (typeof slug !== 'string' || !slug.trim()) {
      return reply.code(400).send({ error: 'slug is required and must be a non-empty string' });
    }

    // Validate meta has at least title
    if (!meta.title) {
      return reply.code(400).send({ error: 'meta.title is required' });
    }

    // Preserve nested directory structure from slug
    const filePath = path.join(articlesDir, slug + '.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Save as JSON file (astro-builder.js will convert to MDX during build)
    const articleData = { slug, meta, content };
    await fs.writeFile(
      filePath,
      JSON.stringify(articleData, null, 2)
    );

    return {
      message: 'Article uploaded',
      slug,
      filename: slug + '.json'
    };
  }

  // Legacy format: has filename and content (with optional encoding)
  const { filename, content, encoding } = body;

  if (!content) {
    return reply.code(400).send({ error: 'content is required' });
  }

  const rawFilename = filename || `article-${nanoid(6)}.md`;
  const articleFilename = sanitizeFilename(rawFilename);
  if (!articleFilename) {
    return reply.code(400).send({ error: `Invalid filename: ${rawFilename}` });
  }

  const articleContent = encoding === 'base64'
    ? Buffer.from(content, 'base64').toString('utf8')
    : content;

  await fs.writeFile(path.join(articlesDir, articleFilename), articleContent);

  return {
    message: 'Article uploaded',
    article: articleFilename
  };
});

/**
 * GET /jobs/:jobId/articles - List uploaded articles
 */
app.get('/jobs/:jobId/articles', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);
  const articlesDir = path.join(jobDir, 'articles');

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  try {
    const files = await fs.readdir(articlesDir);
    const articles = [];

    for (const file of files) {
      // Include both .md and .json article files
      if (!file.endsWith('.md') && !file.endsWith('.json')) continue;

      const stat = await fs.stat(path.join(articlesDir, file));
      const articleInfo = {
        filename: file,
        format: file.endsWith('.json') ? 'json' : 'markdown',
        size: stat.size,
        uploadedAt: stat.mtime.toISOString()
      };

      // For JSON files, extract the slug
      if (file.endsWith('.json')) {
        try {
          const data = JSON.parse(await fs.readFile(path.join(articlesDir, file), 'utf8'));
          articleInfo.slug = data.slug;
          articleInfo.title = data.meta?.title;
        } catch {}
      }

      articles.push(articleInfo);
    }

    return { articles, count: articles.length };
  } catch {
    return { articles: [], count: 0 };
  }
});

/**
 * DELETE /jobs/:jobId/articles/:filename - Delete an uploaded article
 */
app.delete('/jobs/:jobId/articles/:filename', async (req, reply) => {
  const { jobId } = req.params;
  const safeFilename = sanitizeFilename(req.params.filename);
  if (!safeFilename) {
    return reply.code(400).send({ error: 'Invalid filename' });
  }

  const jobDir = path.join(DATA_DIR, jobId);
  const articlePath = path.join(jobDir, 'articles', safeFilename);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  const status = await readStatus(jobDir);
  if (status.status !== 'draft') {
    return reply.code(409).send({ error: 'Can only delete articles from draft jobs' });
  }

  try {
    await fs.unlink(articlePath);
    return { message: 'Article deleted', filename: safeFilename };
  } catch {
    return reply.code(404).send({ error: 'Article not found' });
  }
});

/**
 * POST /jobs/:jobId/images - Upload images for a draft job
 *
 * Multipart form data with image files
 */
app.post('/jobs/:jobId/images', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);
  const imagesDir = path.join(jobDir, 'images');

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  const status = await readStatus(jobDir);
  if (status.status !== 'draft') {
    return reply.code(409).send({ error: 'Can only upload images to draft jobs' });
  }

  const parts = req.parts();
  const uploadedImages = [];

  for await (const part of parts) {
    if (part.type === 'file') {
      const safeFilename = sanitizeFilename(part.filename);
      if (!safeFilename) {
        return reply.code(400).send({ error: `Invalid image filename: ${part.filename}` });
      }
      const buffer = await part.toBuffer();
      const imagePath = path.join(imagesDir, safeFilename);
      await fs.writeFile(imagePath, buffer);
      uploadedImages.push({
        filename: safeFilename,
        path: `/images/${safeFilename}`,
        size: buffer.length
      });
    }
  }

  return {
    message: `${uploadedImages.length} images uploaded`,
    images: uploadedImages
  };
});

/**
 * POST /jobs/:jobId/favicon - Upload a favicon for the site
 *
 * JSON body:
 * {
 *   "file": "base64encodedcontent...",
 *   "type": "ico" | "png" | "svg"
 * }
 */
app.post('/jobs/:jobId/favicon', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  const status = await readStatus(jobDir);
  if (status.status !== 'draft') {
    return reply.code(409).send({
      error: 'Can only upload favicon to draft jobs',
      currentStatus: status.status
    });
  }

  const { file, type = 'ico' } = req.body;

  if (!file) {
    return reply.code(400).send({ error: 'file (base64 encoded) is required' });
  }

  // Validate type
  const validTypes = ['ico', 'png', 'svg'];
  if (!validTypes.includes(type)) {
    return reply.code(400).send({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }

  const fileBuffer = Buffer.from(file, 'base64');
  const extension = type === 'ico' ? 'ico' : type;
  const faviconPath = path.join(jobDir, `favicon.${extension}`);

  await fs.writeFile(faviconPath, fileBuffer);

  return {
    success: true,
    path: `/favicon.${extension}`,
    size: fileBuffer.length
  };
});

/**
 * GET /jobs/:jobId/images - List uploaded images
 */
app.get('/jobs/:jobId/images', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);
  const imagesDir = path.join(jobDir, 'images');

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  try {
    const files = await fs.readdir(imagesDir);
    const images = [];

    for (const file of files) {
      const stat = await fs.stat(path.join(imagesDir, file));
      images.push({
        filename: file,
        path: `/images/${file}`,
        size: stat.size,
        uploadedAt: stat.mtime.toISOString()
      });
    }

    return { images, count: images.length };
  } catch {
    return { images: [], count: 0 };
  }
});

/**
 * POST /jobs/:jobId/assets - Upload an asset with nested path support
 *
 * Allows uploading assets with nested directory structure preservation.
 * Useful for BlogPostGen which organizes assets like:
 *   - assets/guide/article-name/hero.png
 *   - assets/og-img/guide/article-name.png
 *
 * JSON body:
 * {
 *   "filepath": "assets/guide/wikipedia-visibility/hero.png",
 *   "file": "base64encodedcontent..."
 * }
 *
 * Or multipart form data with:
 *   - filepath: path string
 *   - file: binary file data
 */
app.post('/jobs/:jobId/assets', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  const status = await readStatus(jobDir);
  if (status.status !== 'draft') {
    return reply.code(409).send({
      error: 'Can only upload assets to draft jobs',
      currentStatus: status.status
    });
  }

  const contentType = req.headers['content-type'] || '';

  // Handle multipart form data
  if (contentType.includes('multipart/form-data')) {
    const parts = req.parts();
    let filepath = null;
    let fileBuffer = null;

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'filepath') {
        filepath = part.value;
      } else if (part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer();
      }
    }

    if (!filepath || !fileBuffer) {
      return reply.code(400).send({ error: 'filepath and file are required' });
    }

    const sanitizedPath = sanitizeNestedPath(filepath);
    if (!sanitizedPath) {
      return reply.code(400).send({
        error: 'Invalid filepath. Must not contain path traversal or special characters.',
        provided: filepath
      });
    }

    const targetPath = path.join(jobDir, sanitizedPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, fileBuffer);

    return {
      success: true,
      path: '/' + sanitizedPath,
      size: fileBuffer.length
    };
  }

  // Handle JSON body with base64 encoded file
  const { filepath, file } = req.body;

  if (!filepath) {
    return reply.code(400).send({ error: 'filepath is required' });
  }
  if (!file) {
    return reply.code(400).send({ error: 'file (base64 encoded) is required' });
  }

  const sanitizedPath = sanitizeNestedPath(filepath);
  if (!sanitizedPath) {
    return reply.code(400).send({
      error: 'Invalid filepath. Must not contain path traversal or special characters.',
      provided: filepath
    });
  }

  const targetPath = path.join(jobDir, sanitizedPath);
  const fileBuffer = Buffer.from(file, 'base64');

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, fileBuffer);

  return {
    success: true,
    path: '/' + sanitizedPath,
    size: fileBuffer.length
  };
});

/**
 * GET /jobs/:jobId/assets - List uploaded assets (recursively)
 */
app.get('/jobs/:jobId/assets', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  // Helper to recursively list files
  async function listFilesRecursive(dir, baseDir = '') {
    const results = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = baseDir ? `${baseDir}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip articles and status files
          if (['articles', 'build'].includes(entry.name)) continue;
          const subFiles = await listFilesRecursive(fullPath, relativePath);
          results.push(...subFiles);
        } else if (entry.isFile()) {
          // Skip non-asset files
          if (['status.json', 'input.json', 'build.log'].includes(entry.name)) continue;
          const stat = await fs.stat(fullPath);
          results.push({
            path: '/' + relativePath,
            size: stat.size,
            uploadedAt: stat.mtime.toISOString()
          });
        }
      }
    } catch {}
    return results;
  }

  const assets = await listFilesRecursive(jobDir);

  return { assets, count: assets.length };
});

/**
 * POST /jobs/:jobId/start - Start building a draft job
 */
app.post('/jobs/:jobId/start', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);
  const articlesDir = path.join(jobDir, 'articles');

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  const status = await readStatus(jobDir);
  if (status.status !== 'draft') {
    return reply.code(409).send({
      error: 'Can only start draft jobs',
      currentStatus: status.status,
      hint: status.status === 'running' ? 'Job is already running' : 'Use /restart to re-run completed/failed jobs'
    });
  }

  // Check for articles (both .md and .json formats)
  let articleCount = 0;
  try {
    const files = await fs.readdir(articlesDir);
    articleCount = files.filter(f => f.endsWith('.md') || f.endsWith('.json')).length;
  } catch {}

  if (articleCount === 0) {
    return reply.code(400).send({
      error: 'No articles uploaded',
      hint: 'Upload articles via POST /jobs/:jobId/articles first'
    });
  }

  // Read job config
  const input = JSON.parse(await fs.readFile(path.join(jobDir, 'input.json'), 'utf8'));
  const templateDir = path.join(TEMPLATES_DIR, input.template || 'default');

  await writeStatus(jobDir, 'queued', `Starting build with ${articleCount} articles`);
  runBuild(jobId, jobDir, templateDir, input.sessionId || nanoid(8));

  return reply.code(202).send({
    jobId,
    status: 'queued',
    articlesCount: articleCount
  });
});

/**
 * GET /jobs/:jobId - Get job status
 */
app.get('/jobs/:jobId', async (req, reply) => {
  const jobDir = path.join(DATA_DIR, req.params.jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  const status = await readStatus(jobDir);

  // For draft jobs, include article count (both .md and .json formats)
  if (status.status === 'draft') {
    try {
      const files = await fs.readdir(path.join(jobDir, 'articles'));
      status.articlesUploaded = files.filter(f => f.endsWith('.md') || f.endsWith('.json')).length;
    } catch {
      status.articlesUploaded = 0;
    }
  }

  return status;
});

/**
 * GET /jobs/:jobId/logs - Get job build logs
 */
app.get('/jobs/:jobId/logs', async (req, reply) => {
  const jobDir = path.join(DATA_DIR, req.params.jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  try {
    const logs = await fs.readFile(path.join(jobDir, 'build.log'), 'utf8');
    return { logs: logs.split('\n').filter(Boolean) };
  } catch {
    return { logs: [] };
  }
});

/**
 * POST /jobs/:jobId/restart - Restart a failed/completed job
 */
app.post('/jobs/:jobId/restart', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  const status = await readStatus(jobDir);
  if (status.status === 'running') {
    return reply.code(409).send({ error: 'Job is already running' });
  }
  if (status.status === 'draft') {
    return reply.code(409).send({
      error: 'Cannot restart a draft job',
      hint: 'Use POST /jobs/:jobId/start instead'
    });
  }

  // Read original input
  const input = JSON.parse(await fs.readFile(path.join(jobDir, 'input.json'), 'utf8'));
  const templateDir = path.join(TEMPLATES_DIR, input.template || 'default');

  // Clear old log and build directory
  await fs.writeFile(path.join(jobDir, 'build.log'), '', 'utf8');
  await fs.rm(path.join(jobDir, 'build'), { recursive: true, force: true }).catch(() => {});

  await writeStatus(jobDir, 'queued', 'Job restarted');
  runBuild(jobId, jobDir, templateDir, input.sessionId || nanoid(8));

  return { jobId, status: 'queued', message: 'Job restarted' };
});

/**
 * DELETE /jobs/:jobId - Delete a job (local data only)
 *
 * Note: Cloudflare resources (Pages project, custom domain, DNS) are NOT deleted.
 * To delete Cloudflare resources, use the Cloudflare dashboard directly.
 */
app.delete('/jobs/:jobId', async (req, reply) => {
  const jobDir = path.join(DATA_DIR, req.params.jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  await fs.rm(jobDir, { recursive: true, force: true });
  return { message: 'Job deleted' };
});

/**
 * POST /jobs/:jobId/domain - Add a custom domain to a completed job's site
 *
 * This registers a customer's own domain (e.g., blog.acme.com) as a custom domain
 * on the Cloudflare Pages project. The customer then needs to add a CNAME record
 * pointing their domain to the *.sites.aicw.io subdomain.
 *
 * Body:
 * {
 *   "domain": "blog.acme.com"
 * }
 *
 * Returns CNAME instructions for the customer to configure their DNS.
 */
app.post('/jobs/:jobId/domain', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  // Check job is completed
  const status = await readStatus(jobDir);
  if (status.status !== 'completed') {
    return reply.code(409).send({
      error: 'Can only add custom domains to completed jobs',
      currentStatus: status.status
    });
  }

  // Validate domain from request body
  const { domain } = req.body;
  if (!domain) {
    return reply.code(400).send({ error: 'domain is required' });
  }

  const validation = validateDomain(domain);
  if (!validation.valid) {
    return reply.code(400).send({ error: validation.error });
  }

  // Get the project name from the job input
  const input = JSON.parse(await fs.readFile(path.join(jobDir, 'input.json'), 'utf8'));
  const projectName = input.cloudflareProjectName;

  if (!projectName) {
    return reply.code(400).send({
      error: 'Job was not deployed to Cloudflare Pages (no cloudflareProjectName)'
    });
  }

  // The sites subdomain that the customer should CNAME to
  const sitesSubdomain = getSitesHostname(projectName);

  try {
    // Register the custom domain on the Pages project
    const result = await addCustomDomain({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      projectName,
      domain: domain.toLowerCase(),
      apiToken: process.env.CLOUDFLARE_API_TOKEN
    });

    // Update job status with the custom domain info
    const existingStatus = await readStatus(jobDir);
    const customDomains = existingStatus.customDomains || [];
    if (!customDomains.includes(domain.toLowerCase())) {
      customDomains.push(domain.toLowerCase());
    }
    await writeStatus(jobDir, 'completed', existingStatus.message, {
      ...existingStatus,
      customDomains
    });

    return {
      success: true,
      domain: domain.toLowerCase(),
      status: result.status || 'pending',
      cnameInstructions: {
        recordType: 'CNAME',
        name: domain.toLowerCase(),
        value: sitesSubdomain,
        message: `Add a CNAME record in your DNS pointing ${domain} to ${sitesSubdomain}. SSL will be automatically provisioned once the CNAME is verified.`
      },
      siteUrls: {
        sitesSubdomain: `https://${sitesSubdomain}`,
        customDomain: `https://${domain.toLowerCase()}`
      }
    };
  } catch (error) {
    // Check if domain is already registered
    if (error.message.includes('already exists') ||
        error.message.includes('already been registered')) {
      return reply.code(409).send({
        error: 'Domain is already registered on this project',
        domain: domain.toLowerCase()
      });
    }
    throw error;
  }
});

/**
 * GET /jobs/:jobId/domains - List custom domains for a completed job
 */
app.get('/jobs/:jobId/domains', async (req, reply) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(DATA_DIR, jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  // Get the project name from the job input
  const input = JSON.parse(await fs.readFile(path.join(jobDir, 'input.json'), 'utf8'));
  const projectName = input.cloudflareProjectName;

  if (!projectName) {
    return reply.code(400).send({
      error: 'Job was not deployed to Cloudflare Pages'
    });
  }

  try {
    const domains = await listCustomDomains({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      projectName,
      apiToken: process.env.CLOUDFLARE_API_TOKEN
    });

    return {
      domains: domains.map(d => ({
        name: d.name,
        status: d.status,
        createdOn: d.created_on,
        certificateStatus: d.certificate_authority
      })),
      count: domains.length
    };
  } catch (error) {
    if (error.message.includes('not found')) {
      return { domains: [], count: 0 };
    }
    throw error;
  }
});

/**
 * DELETE /jobs/:jobId/domain/:domain - Remove a custom domain
 */
app.delete('/jobs/:jobId/domain/:domain', async (req, reply) => {
  const jobId = req.params.jobId;
  const domain = req.params.domain;
  const jobDir = path.join(DATA_DIR, jobId);

  try {
    await fs.access(jobDir);
  } catch {
    return reply.code(404).send({ error: 'Job not found' });
  }

  // Get the project name from the job input
  const input = JSON.parse(await fs.readFile(path.join(jobDir, 'input.json'), 'utf8'));
  const projectName = input.cloudflareProjectName;

  if (!projectName) {
    return reply.code(400).send({
      error: 'Job was not deployed to Cloudflare Pages'
    });
  }

  try {
    await removeCustomDomain({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      projectName,
      domain,
      apiToken: process.env.CLOUDFLARE_API_TOKEN
    });

    // Update job status to remove the custom domain
    const existingStatus = await readStatus(jobDir);
    const customDomains = (existingStatus.customDomains || []).filter(d => d !== domain);
    await writeStatus(jobDir, 'completed', existingStatus.message, {
      ...existingStatus,
      customDomains
    });

    return { deleted: true, domain };
  } catch (error) {
    if (error.message.includes('not found')) {
      return reply.code(404).send({ error: 'Domain not found on this project' });
    }
    throw error;
  }
});

/**
 * GET /jobs - List all jobs
 */
app.get('/jobs', async (req, reply) => {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const jobs = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const status = await readStatus(path.join(DATA_DIR, entry.name)).catch(() => null);
      if (status) {
        jobs.push({ jobId: entry.name, ...status });
      }
    }
  }

  // Sort by createdAt descending
  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { jobs: jobs.slice(0, 50) };
});

/**
 * GET /templates - List available templates
 */
app.get('/templates', async (req, reply) => {
  try {
    const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
    const templates = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const configPath = path.join(TEMPLATES_DIR, entry.name, 'config.defaults.json');
          const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
          templates.push({
            name: entry.name,
            description: config.site?.description || '',
            features: Object.keys(config)
          });
        } catch {
          templates.push({ name: entry.name, description: '', features: [] });
        }
      }
    }

    return { templates };
  } catch {
    return { templates: [] };
  }
});

// ============ Helper Functions ============

async function writeStatus(jobDir, status, message, extra = {}) {
  const statusFile = path.join(jobDir, 'status.json');
  let existing = {};

  try {
    existing = JSON.parse(await fs.readFile(statusFile, 'utf8'));
  } catch {}

  const data = {
    ...existing,
    status,
    message,
    ...extra,
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString(),
  };

  await fs.writeFile(statusFile, JSON.stringify(data, null, 2));
}

async function readStatus(jobDir) {
  const statusFile = path.join(jobDir, 'status.json');
  return JSON.parse(await fs.readFile(statusFile, 'utf8'));
}

async function appendLog(jobDir, line, sessionId) {
  const logFile = path.join(jobDir, 'build.log');
  const prefix = sessionId ? `[${new Date().toISOString()}] [session:${sessionId}]` : `[${new Date().toISOString()}]`;
  await fs.appendFile(logFile, `${prefix} ${line}\n`);
}

// ============ Build Process ============

async function runBuild(jobId, jobDir, templateDir, sessionId) {
  const buildDir = path.join(jobDir, 'build');
  const distDir = path.join(buildDir, 'dist');
  const articlesDir = path.join(jobDir, 'articles');
  const startTime = Date.now();

  // Scoped log helper that includes session ID
  const log = (msg) => appendLog(jobDir, msg, sessionId);

  // Read job config
  const input = JSON.parse(await fs.readFile(path.join(jobDir, 'input.json'), 'utf8'));
  const { cloudflareProjectName, publishTarget = 'cloudflare', config } = input;

  try {
    await writeStatus(jobDir, 'running', 'Starting build');
    await log('Build started');

    // 1. Create build directory
    await fs.mkdir(distDir, { recursive: true });
    await log('Created build directory');

    // 2. Read articles from articles directory (supports nested dirs, .md and .json formats)
    const articles = [];

    async function readArticlesRecursive(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await readArticlesRecursive(fullPath);
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
          const content = await fs.readFile(fullPath, 'utf8');
          const relativePath = path.relative(articlesDir, fullPath);
          articles.push({ filename: relativePath, content });
        }
      }
    }

    await readArticlesRecursive(articlesDir);

    await log(`Found ${articles.length} articles (md + json)`);

    // 3. Build the site with Astro
    await writeStatus(jobDir, 'running', 'Building site');
    await log(`Building site with ${articles.length} articles`);

    const buildResult = await buildAstroSite({
      templateDir,
      outputDir: distDir,
      config: config?.siteConfig || config || {},
      articles,
      jobDir,
      logFn: (msg) => log(msg)
    });

    await log(`Built ${buildResult.totalArticles} articles, ${buildResult.totalPages} pages`);

    // 5. Publish based on target
    if (publishTarget === 'folder') {
      // Folder mode: keep build directory, return local path
      await writeStatus(jobDir, 'running', 'Publishing to folder');
      await log('Folder publish mode - keeping build output');

      const duration = Date.now() - startTime;
      await writeStatus(jobDir, 'completed', 'Build successful (folder)', {
        path: distDir,
        duration,
        articlesCount: buildResult.totalArticles,
        pagesCount: buildResult.totalPages
      });
      await log(`Build completed in ${duration}ms - output at: ${distDir}`);
    } else {
      // Cloudflare mode: deploy using direct API
      await writeStatus(jobDir, 'running', 'Deploying to Cloudflare');
      await log('Deploying to Cloudflare Pages via API');

      const deployResult = await deployToCloudflarePages({
        outputDir: distDir,
        projectName: cloudflareProjectName,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
        branch: 'main',
        logFn: (msg) => log(msg)
      });

      if (!deployResult.success) {
        throw new Error(`Cloudflare deployment failed: ${deployResult.error}`);
      }

      await log(`Deployed to ${deployResult.url}`);

      // 6. Cleanup build directory (keep logs and status)
      await fs.rm(buildDir, { recursive: true, force: true });

      const duration = Date.now() - startTime;
      await writeStatus(jobDir, 'completed', 'Build successful', {
        url: deployResult.url,
        deploymentId: deployResult.deploymentId,
        duration,
        articlesCount: buildResult.totalArticles,
        pagesCount: buildResult.totalPages,
        filesUploaded: deployResult.filesUploaded
      });
      await log(`Build completed in ${duration}ms`);
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    await log(`ERROR: ${error.message}`);
    if (error.stderr) {
      await log(`STDERR: ${error.stderr}`);
    }

    // Build a useful error message: prefer stderr tail for execa failures
    // (error.message is often just "Command failed with exit code 1")
    let statusMessage = error.message;
    if (error.stderr) {
      const stderrLines = error.stderr.trim().split('\n');
      const tail = stderrLines.slice(-10).join('\n');
      statusMessage = `${error.message}\n--- stderr (last 10 lines) ---\n${tail}`;
    }

    await writeStatus(jobDir, 'failed', statusMessage, { duration, buildDir });

    // Keep build directory on failure for debugging
    await log(`Build files preserved at: ${buildDir}`);
  }
}

// Start server
const port = parseInt(process.env.PORT || '4002');
await app.listen({ host: '0.0.0.0', port });
console.log(`AICW Website Builder API running on port ${port}`);
console.log(`Templates directory: ${TEMPLATES_DIR}`);
console.log(`Data directory: ${DATA_DIR}`);
