/**
 * Link Verifier Utility
 *
 * Verifies that external URLs in article content are accessible.
 * Uses HEAD requests with GET fallback, with concurrency control.
 */

/**
 * Information about a failed link
 */
export interface FailedLink {
  /** The URL that failed */
  url: string;
  /** HTTP status code if available */
  statusCode?: number;
  /** Error type if not an HTTP error */
  errorType?: 'timeout' | 'network' | 'invalid_url' | 'unknown';
  /** Error message */
  message?: string;
}

/**
 * Result of link verification
 */
export interface LinkVerificationResult {
  /** Whether all links are accessible */
  success: boolean;
  /** Total number of unique URLs checked */
  totalChecked: number;
  /** Number of URLs that passed */
  passed: number;
  /** List of failed links */
  failed: FailedLink[];
}

/**
 * Regex to find external links in markdown content.
 * Matches [text](url) and ![alt](url) where url starts with http:// or https://
 */
const EXTERNAL_LINK_REGEX = /!?\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;

/**
 * Check if a URL is accessible
 */
async function checkUrl(url: string): Promise<{ ok: boolean; statusCode?: number; errorType?: FailedLink['errorType']; message?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogPostGen/1.0)' },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { ok: true };
      }

      if (response.status === 405 || response.status === 403) {
        // Fall through to GET fallback
      } else {
        return { ok: false, statusCode: response.status };
      }
    } catch (headError) {
      clearTimeout(timeoutId);
    }

    // Fallback: GET request with range header
    const controllerGet = new AbortController();
    const timeoutGet = setTimeout(() => controllerGet.abort(), 8000);

    const responseGet = await fetch(url, {
      method: 'GET',
      signal: controllerGet.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BlogPostGen/1.0)',
        'Range': 'bytes=0-100',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutGet);

    if (responseGet.ok || responseGet.status === 206) {
      return { ok: true };
    }

    return { ok: false, statusCode: responseGet.status };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { ok: false, errorType: 'timeout', message: 'Request timed out' };
      }
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        return { ok: false, errorType: 'network', message: 'DNS resolution failed' };
      }
      if (error.message.includes('Invalid URL')) {
        return { ok: false, errorType: 'invalid_url', message: error.message };
      }
      return { ok: false, errorType: 'unknown', message: error.message };
    }
    return { ok: false, errorType: 'unknown', message: String(error) };
  }
}

/**
 * Verify all external links in article content are accessible.
 *
 * @param content - The article markdown content
 * @returns Verification result with list of any failed links
 */
export async function verifyLinks(content: string): Promise<LinkVerificationResult> {
  const uniqueUrls = new Set<string>();
  const matches = content.matchAll(EXTERNAL_LINK_REGEX);

  for (const match of matches) {
    uniqueUrls.add(match[2]);
  }

  const urls = Array.from(uniqueUrls);
  const failed: FailedLink[] = [];

  const batchSize = 5;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (url) => {
        const result = await checkUrl(url);
        return { url, ...result };
      })
    );

    for (const result of results) {
      if (!result.ok) {
        failed.push({
          url: result.url,
          statusCode: result.statusCode,
          errorType: result.errorType,
          message: result.message,
        });
      }
    }
  }

  return {
    success: failed.length === 0,
    totalChecked: urls.length,
    passed: urls.length - failed.length,
    failed,
  };
}
