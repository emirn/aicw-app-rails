import Fastify from 'fastify';
import cors from '@fastify/cors';
import { nanoid } from 'nanoid';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// Config
const DATA_DIR = process.env.DATA_DIR || '/data/aicw-website-builder';
const API_SECRET = process.env.API_SECRET;

// Ensure data directory exists
await fs.mkdir(DATA_DIR, { recursive: true });

// Simple auth middleware
app.addHook('preHandler', async (req, reply) => {
  if (req.url === '/health') return;
  const key = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!key || key !== API_SECRET) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
});

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

/**
 * POST /jobs - Create and start a build job
 */
app.post('/jobs', async (req, reply) => {
  const { templateRepo, templateBranch = 'main', siteId, cloudflareProjectName, config, articles } = req.body;

  if (!templateRepo || !siteId || !cloudflareProjectName) {
    return reply.code(400).send({ error: 'templateRepo, siteId, cloudflareProjectName required' });
  }

  const jobId = `${siteId}_${nanoid(8)}`;
  const jobDir = path.join(DATA_DIR, jobId);

  // Create job directory and save input
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'input.json'), JSON.stringify(req.body, null, 2));
  await writeStatus(jobDir, 'queued', 'Job created');

  // Start build in background (fire and forget)
  runBuild(jobId, jobDir, req.body);

  return reply.code(202).send({
    jobId,
    status: 'queued',
    links: { status: `/jobs/${jobId}`, restart: `/jobs/${jobId}/restart`, delete: `/jobs/${jobId}` }
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
  return status;
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

  // Read original input and restart
  const input = JSON.parse(await fs.readFile(path.join(jobDir, 'input.json'), 'utf8'));
  await writeStatus(jobDir, 'queued', 'Job restarted');
  
  runBuild(jobId, jobDir, input);

  return { jobId, status: 'queued', message: 'Job restarted' };
});

/**
 * DELETE /jobs/:jobId - Delete a job
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

async function appendLog(jobDir, line) {
  const logFile = path.join(jobDir, 'build.log');
  await fs.appendFile(logFile, `[${new Date().toISOString()}] ${line}\n`);
}

// ============ Build Process ============

async function runBuild(jobId, jobDir, input) {
  const { templateRepo, templateBranch, cloudflareProjectName, config, articles } = input;
  const buildDir = path.join(jobDir, 'build');
  const startTime = Date.now();

  try {
    await writeStatus(jobDir, 'running', 'Starting build');
    await appendLog(jobDir, 'Build started');

    // 1. Clone template
    await writeStatus(jobDir, 'running', 'Cloning template');
    await appendLog(jobDir, `Cloning ${templateRepo}`);
    
    let repoUrl = templateRepo.startsWith('https://') ? templateRepo : `https://${templateRepo}`;
    if (process.env.GITHUB_TOKEN && repoUrl.includes('github.com')) {
      repoUrl = repoUrl.replace('github.com', `${process.env.GITHUB_TOKEN}@github.com`);
    }

    await execa('git', ['clone', '--depth', '1', '--branch', templateBranch, repoUrl, buildDir], { timeout: 120000 });
    await appendLog(jobDir, 'Template cloned');

    // 2. Write config
    if (config?.siteConfig) {
      await writeStatus(jobDir, 'running', 'Applying config');
      const configPath = path.join(buildDir, 'src', 'config');
      await fs.mkdir(configPath, { recursive: true });
      await fs.writeFile(path.join(configPath, 'site.config.json'), JSON.stringify(config.siteConfig, null, 2));
      await appendLog(jobDir, 'Config applied');
    }

    // 3. Write articles
    if (articles?.length > 0) {
      await writeStatus(jobDir, 'running', `Writing ${articles.length} articles`);
      for (const article of articles) {
        const filePath = path.join(buildDir, article.filepath.replace(/^\//, ''), article.filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const content = article.encoding === 'base64' 
          ? Buffer.from(article.content, 'base64') 
          : article.content;
        await fs.writeFile(filePath, content);
      }
      await appendLog(jobDir, `Wrote ${articles.length} articles`);
    }

    // 4. Install dependencies
    await writeStatus(jobDir, 'running', 'Installing dependencies');
    await appendLog(jobDir, 'Installing dependencies');
    
    const hasPnpm = await fs.access(path.join(buildDir, 'pnpm-lock.yaml')).then(() => true).catch(() => false);
    const pm = hasPnpm ? 'pnpm' : 'npm';
    
    await execa(pm, ['install'], { cwd: buildDir, timeout: 300000, env: { ...process.env, CI: 'true' } });
    await appendLog(jobDir, 'Dependencies installed');

    // 5. Build
    await writeStatus(jobDir, 'running', 'Building site');
    await appendLog(jobDir, 'Building Astro site');
    
    await execa(pm, ['run', 'build'], { cwd: buildDir, timeout: 600000, env: { ...process.env, CI: 'true', NODE_ENV: 'production' } });
    await appendLog(jobDir, 'Build completed');

    // 6. Deploy to Cloudflare
    await writeStatus(jobDir, 'running', 'Deploying to Cloudflare');
    await appendLog(jobDir, 'Deploying to Cloudflare Pages');

    const deployResult = await execa('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', cloudflareProjectName, '--branch', 'main'], {
      cwd: buildDir,
      timeout: 300000,
      env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID }
    });

    // Parse deployment URL from wrangler output
    const urlMatch = deployResult.stdout.match(/https:\/\/[^\s]+\.pages\.dev/);
    const deployUrl = urlMatch ? urlMatch[0] : `https://${cloudflareProjectName}.pages.dev`;

    await appendLog(jobDir, `Deployed to ${deployUrl}`);

    // 7. Cleanup build directory (keep logs and status)
    await fs.rm(buildDir, { recursive: true, force: true });

    const duration = Date.now() - startTime;
    await writeStatus(jobDir, 'completed', 'Build successful', { url: deployUrl, duration });
    await appendLog(jobDir, `Build completed in ${duration}ms`);

  } catch (error) {
    const duration = Date.now() - startTime;
    await appendLog(jobDir, `ERROR: ${error.message}`);
    await writeStatus(jobDir, 'failed', error.message, { duration });
    
    // Cleanup on failure
    await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Start server
const port = parseInt(process.env.PORT || '3000');
await app.listen({ host: '0.0.0.0', port });
console.log(`Server running on port ${port}`);
