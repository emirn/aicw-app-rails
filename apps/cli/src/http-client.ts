import fetch from 'node-fetch';
import { Logger } from './logger';

/** HTTP status codes that should trigger a retry */
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

/** Default retry configuration */
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * HTTP client for calling the sgen API
 */
export class SgenClient {
  constructor(
    private baseUrl: string,
    private logger: Logger,
    private defaultTimeout: number = 60000
  ) {}

  /**
   * Execute a function with retry logic using exponential backoff
   */
  private async withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Check if this error is retryable (network errors or specific HTTP codes)
        const status = error?.status || error?.statusCode;
        const isRetryable = !status || RETRYABLE_STATUSES.includes(status);

        // Don't retry if not retryable or if this was the last attempt
        if (!isRetryable || attempt === RETRY_CONFIG.maxAttempts) {
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
          RETRY_CONFIG.maxDelayMs
        );

        this.logger.log(`  Retry ${attempt}/${RETRY_CONFIG.maxAttempts} for ${context} in ${Math.round(delay)}ms (${error.message})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * POST request to API endpoint with retry logic
   */
  async post<T>(path: string, body: any, timeoutMs?: number): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeout = timeoutMs || this.defaultTimeout;

    this.logger.log(`POST ${path} (timeout: ${timeout}ms)`);

    return this.withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Throw with status code for retry logic to check
        if (!response.ok) {
          const text = await response.text();
          const err = new Error(`HTTP ${response.status}: ${text}`);
          (err as any).status = response.status;
          throw err;
        }

        const data = await response.json();
        return data as T;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      }
    }, `POST ${path}`);
  }

  /**
   * GET request to API endpoint with retry logic
   */
  async get<T>(path: string, timeoutMs?: number): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeout = timeoutMs || this.defaultTimeout;

    this.logger.log(`GET ${path} (timeout: ${timeout}ms)`);

    return this.withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Throw with status code for retry logic to check
        if (!response.ok) {
          const text = await response.text();
          const err = new Error(`HTTP ${response.status}: ${text}`);
          (err as any).status = response.status;
          throw err;
        }

        const data = await response.json();
        return data as T;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      }
    }, `GET ${path}`);
  }

  /**
   * Generate project branding config via AI
   */
  async generateProjectConfig(body: {
    site_name: string;
    site_description: string;
    site_url?: string;
    color_preference?: string;
    previous_config?: Record<string, unknown>;
    user_comments?: string;
  }): Promise<{ success: boolean; branding?: any; error?: string; cost_usd?: number }> {
    return this.post('/api/v1/project/generate-config', body, 120000);
  }

  /**
   * Check if sgen is healthy and reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const health = await this.get<{ status: string }>('/health', 5000);
      return health.status === 'ok';
    } catch {
      return false;
    }
  }
}
