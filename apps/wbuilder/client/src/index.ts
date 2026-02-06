import axios, { AxiosInstance } from 'axios';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { existsSync } from 'fs';
import * as crypto from 'crypto';

export interface BlogPostGenArticle {
  slug: string;
  meta: {
    title: string;
    description: string;
    keywords: string[];
    created_at: string;
    updated_at?: string;
    image_hero?: string;
    image_og?: string;
  };
  content: string;
}

export interface JobStatus {
  status: 'draft' | 'queued' | 'running' | 'completed' | 'failed';
  path?: string;
  url?: string;
  message?: string;
  duration?: number;
  articlesCount?: number;
  pagesCount?: number;
}

export interface SiteConfig {
  site?: {
    name?: string;
    url?: string;
    description?: string;
  };
  [key: string]: unknown;
}

export interface CreateJobOptions {
  siteId: string;
  publishTarget: 'folder' | 'cloudflare';
  cloudflareProjectName?: string;
  config?: SiteConfig;
}

export class WebsiteBuilderClient {
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

  /**
   * Update API key (used after starting server with generated key)
   */
  setApiKey(key: string): void {
    this.apiKey = key;
    this.client.defaults.headers['X-API-Key'] = key;
  }

  /**
   * Check if the website builder server is running
   */
  async checkServerRunning(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 2000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Start the website builder server if not already running
   * @param serverPath - Path to the api-server directory
   */
  async startServer(serverPath: string): Promise<void> {
    // Generate session API key
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

    // Capture output for debugging
    this.serverProcess.stdout?.on('data', () => {});
    this.serverProcess.stderr?.on('data', () => {});

    // Wait for server ready (max 15 seconds)
    const maxWait = 15000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      if (await this.checkServerRunning()) return;
      await this.sleep(500);
    }
    throw new Error('Failed to start website builder server');
  }

  /**
   * Create a new build job
   */
  async createJob(options: CreateJobOptions): Promise<string> {
    const response = await this.client.post('/jobs', options);
    return response.data.jobId;
  }

  /**
   * Upload an article to a draft job
   */
  async uploadArticle(jobId: string, article: BlogPostGenArticle): Promise<void> {
    await this.client.post(`/jobs/${jobId}/articles`, article);
  }

  /**
   * Upload an asset to a draft job
   * @param jobId - Job ID
   * @param filepath - Path relative to the job directory (e.g., "assets/guide/hero.png")
   * @param content - File content as Buffer
   */
  async uploadAsset(jobId: string, filepath: string, content: Buffer): Promise<void> {
    await this.client.post(`/jobs/${jobId}/assets`, {
      filepath,
      file: content.toString('base64'),
    });
  }

  /**
   * Start building a draft job
   */
  async startBuild(jobId: string): Promise<void> {
    await this.client.post(`/jobs/${jobId}/start`, {});
  }

  /**
   * Get job status
   */
  async getStatus(jobId: string): Promise<JobStatus> {
    const response = await this.client.get(`/jobs/${jobId}`);
    return response.data;
  }

  /**
   * Poll for job completion
   */
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

  /**
   * Cleanup - kill the server process if we started it
   */
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

export default WebsiteBuilderClient;
