/**
 * Retry utility with exponential backoff
 *
 * Provides a withRetry wrapper for async functions that automatically
 * retries on transient failures (network issues, rate limits, server errors).
 */

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Check if an error is retryable based on HTTP status code
 */
function isRetryableError(error: any, retryableStatuses: number[]): boolean {
  // Network errors (no status) are retryable
  const status = error?.status || error?.statusCode;
  if (!status) return true;

  // Check if status is in retryable list
  return retryableStatuses.includes(status);
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  // Add jitter (0-1000ms) to prevent thundering herd
  const jitter = Math.random() * 1000;
  // Cap at maxDelay
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Wrap an async function with retry logic
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @param logger - Optional logger for retry attempts
 * @returns Promise resolving to the function's return value
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const response = await withRetry(
 *   () => fetch(url),
 *   { maxAttempts: 3 },
 *   logger
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  logger?: { warn: (obj: any, msg: string) => void }
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if this error is retryable
      const isRetryable = isRetryableError(error, opts.retryableStatuses);

      // Don't retry if not retryable or if this was the last attempt
      if (!isRetryable || attempt === opts.maxAttempts) {
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);

      // Log the retry attempt
      logger?.warn(
        {
          attempt,
          maxAttempts: opts.maxAttempts,
          delayMs: Math.round(delay),
          error: error.message || String(error),
          status: error?.status || error?.statusCode,
        },
        'retry:attempt_failed'
      );

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a fetch wrapper that throws on retryable HTTP errors
 *
 * This is useful for wrapping fetch calls to ensure that server errors
 * trigger the retry logic.
 *
 * @param fetchFn - The fetch function to wrap
 * @param retryableStatuses - HTTP status codes that should throw for retry
 * @returns The Response if successful, throws if status is retryable
 */
export function createRetryableFetch(
  retryableStatuses: number[] = DEFAULT_OPTIONS.retryableStatuses
): (url: string, options?: RequestInit) => Promise<Response> {
  return async (url: string, options?: RequestInit): Promise<Response> => {
    const response = await fetch(url, options);

    if (!response.ok && retryableStatuses.includes(response.status)) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).status = response.status;
      (error as any).statusText = response.statusText;
      throw error;
    }

    return response;
  };
}
