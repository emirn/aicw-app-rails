/**
 * Website Builder Preview
 *
 * Orchestrates building and previewing published articles as a website
 * using the AICW Website Builder API.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { parsePublishedFolder, BlogPostGenArticle } from './published-parser.js';
import { normalizeUrl } from '../url-utils.js';

// ============ Website Builder Client ============

interface JobStatus {
  status: 'draft' | 'queued' | 'running' | 'completed' | 'failed';
  path?: string;
  url?: string;
  message?: string;
  duration?: number;
  articlesCount?: number;
  pagesCount?: number;
}

interface SiteConfig {
  site?: {
    name?: string;
    url?: string;
    description?: string;
  };
  [key: string]: unknown;
}

interface CreateJobOptions {
  siteId: string;
  publishTarget: 'folder' | 'cloudflare';
  cloudflareProjectName?: string;
  config?: SiteConfig;
}

class WebsiteBuilderClient {
  private client: AxiosInstance;
  private apiKey: string;
  private serverProcess: ChildProcess | null = null;

  constructor(options: { baseUrl?: string; apiKey?: string } = {}) {
    this.apiKey = options.apiKey || process.env.AICW_WEBSITE_BUILD_API_KEY || '';
    this.client = axios.create({
      baseURL: options.baseUrl || 'http://localhost:4002',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
    });
  }

  setApiKey(key: string): void {
    this.apiKey = key;
    this.client.defaults.headers['X-API-Key'] = key;
  }

  async checkServerRunning(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 2000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async startServer(serverPath: string): Promise<void> {
    const generatedKey = crypto.randomBytes(16).toString('hex');
    this.setApiKey(generatedKey);

    this.serverProcess = spawn('node', ['src/server.js'], {
      cwd: serverPath,
      env: {
        ...process.env,
        AICW_WEBSITE_BUILD_API_KEY: generatedKey,
        PORT: '4002',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    this.serverProcess.stdout?.on('data', () => {});
    this.serverProcess.stderr?.on('data', () => {});

    const maxWait = 15000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      if (await this.checkServerRunning()) return;
      await this.sleep(500);
    }
    throw new Error('Failed to start website builder server');
  }

  async createJob(options: CreateJobOptions): Promise<string> {
    const response = await this.client.post('/jobs', options);
    return response.data.jobId;
  }

  async uploadArticle(jobId: string, article: BlogPostGenArticle): Promise<void> {
    await this.client.post(`/jobs/${jobId}/articles`, article);
  }

  async uploadAsset(jobId: string, filepath: string, content: Buffer): Promise<void> {
    await this.client.post(`/jobs/${jobId}/assets`, {
      filepath,
      file: content.toString('base64'),
    });
  }

  async startBuild(jobId: string): Promise<void> {
    await this.client.post(`/jobs/${jobId}/start`, {});
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const response = await this.client.get(`/jobs/${jobId}`);
    return response.data;
  }

  async pollUntilComplete(
    jobId: string,
    options: { onProgress?: (status: JobStatus) => void; interval?: number } = {}
  ): Promise<JobStatus> {
    const { onProgress, interval = 1000 } = options;
    while (true) {
      const status = await this.getStatus(jobId);
      if (onProgress) onProgress(status);
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
      await this.sleep(interval);
    }
  }

  cleanup(): void {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============ Preview Orchestration ============

export interface PreviewOptions {
  projectRoot: string;
  projectName: string;
  projectConfig?: {
    name?: string;
    url?: string;
    website_info?: { description?: string };
    title?: string;
    description?: string;
  };
  logger: { log: (msg: string) => void };
}

export async function runWebsitePreview(options: PreviewOptions): Promise<{ success: boolean; path?: string; error?: string }> {
  const { projectRoot, projectName, projectConfig, logger } = options;

  // 1. Read published articles
  const publishedDir = path.join(projectRoot, 'published');
  const articles = await parsePublishedFolder(publishedDir);

  if (articles.length === 0) {
    return { success: false, error: 'No published articles found. Run "publish" first.' };
  }

  logger.log(`Found ${articles.length} published articles`);

  // 2. Initialize client
  const client = new WebsiteBuilderClient();

  // 3. Start server if not running
  if (!await client.checkServerRunning()) {
    logger.log('Starting website builder server...');
    const serverPath = getWebsiteBuilderServerPath();
    await client.startServer(serverPath);
    logger.log('Server started');
  }

  try {
    // 4. Create job
    const siteId = projectName.replace(/[^a-zA-Z0-9_-]/g, '-');
    const siteName = projectConfig?.name || projectConfig?.title || projectName;
    const jobId = await client.createJob({
      siteId,
      publishTarget: 'folder',
      config: {
        site: {
          name: siteName,
          url: normalizeUrl(projectConfig?.url || 'http://localhost:8080'),
          description: projectConfig?.website_info?.description || projectConfig?.description || '',
        },
        logo: {
          type: 'text',
          text: siteName,
        },
        header: {
          nav_links: [
            { label: 'Home', url: '/' },
          ],
          cta_button: {
            enabled: false,
          },
        },
        footer: {
          columns: [],
          show_powered_by: true,
        },
      },
    });
    logger.log(`Job created: ${jobId}`);

    // 5. Upload articles
    for (const article of articles) {
      await client.uploadArticle(jobId, article);
      logger.log(`  Uploaded: ${article.slug}`);
    }

    // 6. Upload assets if exist
    const assetsDir = path.join(projectRoot, 'published-assets');
    if (existsSync(assetsDir)) {
      const assetCount = await uploadAssetsRecursive(client, jobId, assetsDir, '');
      logger.log(`  Uploaded ${assetCount} assets`);
    }

    // 7. Start build
    await client.startBuild(jobId);
    logger.log('Building...');

    // 8. Poll for completion
    const status = await client.pollUntilComplete(jobId, {
      onProgress: (s) => {
        if (s.message && s.status === 'running') {
          logger.log(`  ${s.message}`);
        }
      },
    });

    // 9. Return result
    if (status.status === 'completed') {
      return { success: true, path: status.path };
    } else {
      return { success: false, error: status.message || 'Build failed' };
    }
  } finally {
    client.cleanup();
  }
}

async function uploadAssetsRecursive(
  client: WebsiteBuilderClient,
  jobId: string,
  baseDir: string,
  relativePath: string
): Promise<number> {
  let count = 0;
  const dirPath = path.join(baseDir, relativePath);
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      count += await uploadAssetsRecursive(client, jobId, baseDir, entryPath);
    } else if (entry.isFile()) {
      const content = await fs.readFile(path.join(dirPath, entry.name));
      await client.uploadAsset(jobId, `assets/${entryPath}`, content);
      count++;
    }
  }
  return count;
}

function getWebsiteBuilderServerPath(): string {
  if (process.env.AICW_WEBSITE_BUILDER_PATH) {
    return process.env.AICW_WEBSITE_BUILDER_PATH;
  }

  // Try relative path from CLI location
  // aicw-app-rails/apps/cli/dist/lib -> ../../aicw-website-builder/api-server
  // Go up 5 levels from dist/lib to websites root
  const possiblePaths = [
    // From dist/lib (compiled): dist/lib -> cli -> apps -> aicw-app-rails -> websites
    path.resolve(__dirname, '../../../../../aicw-website-builder/api-server'),
    // From src/lib (development): src/lib -> cli -> apps -> aicw-app-rails -> websites
    path.resolve(__dirname, '../../../../../aicw-website-builder/api-server'),
  ];

  for (const serverPath of possiblePaths) {
    if (existsSync(serverPath)) {
      return serverPath;
    }
  }

  // Try from current working directory (aicw-app-rails root)
  const cwdPath = path.resolve(process.cwd(), '../aicw-website-builder/api-server');
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  throw new Error(
    'Website builder not found. Set AICW_WEBSITE_BUILDER_PATH env var or run from monorepo root.'
  );
}
