/**
 * Log Truncation Utility
 *
 * Truncates long string values in objects before logging.
 * Prevents huge log entries when errors contain full article content.
 */

const DEFAULT_MAX_LENGTH = 500;

/**
 * Truncate a string if it exceeds maxLength.
 * Returns original string if within limit, otherwise truncated with char count indicator.
 *
 * @example
 * truncateString("short") // "short"
 * truncateString("very long string...", 10) // "very long ...[+9 chars]"
 */
export function truncateString(value: string, maxLength = DEFAULT_MAX_LENGTH): string {
  if (value.length <= maxLength) return value;
  const remaining = value.length - maxLength;
  return `${value.substring(0, maxLength)}...[+${remaining} chars]`;
}

/**
 * Recursively truncate all string values in an object/array.
 * Useful for sanitizing error objects before logging.
 *
 * @param value - Any value (object, array, string, etc.)
 * @param maxLength - Maximum string length before truncation (default: 500)
 * @returns Value with all strings truncated
 *
 * @example
 * truncateForLog({ error: "short", body: "very long content..." })
 * // { error: "short", body: "very long c...[+15 chars]" }
 */
export function truncateForLog<T>(value: T, maxLength = DEFAULT_MAX_LENGTH): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value, maxLength) as T;
  }

  if (Array.isArray(value)) {
    return value.map(item => truncateForLog(item, maxLength)) as T;
  }

  if (typeof value === 'object') {
    // Handle Error objects specially - they have non-enumerable properties
    if (value instanceof Error) {
      return {
        name: value.name,
        message: truncateString(value.message, maxLength),
        stack: value.stack ? truncateString(value.stack, maxLength) : undefined,
      } as T;
    }

    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = truncateForLog(val, maxLength);
    }
    return result as T;
  }

  return value;
}

/**
 * Create a truncated copy of an error for logging.
 * Extracts common error properties and truncates long values.
 *
 * @param err - Error object or any thrown value
 * @param maxLength - Maximum string length before truncation
 * @returns Object safe for logging
 */
export function truncateError(err: any, maxLength = DEFAULT_MAX_LENGTH): Record<string, any> {
  if (!err) return { error: 'Unknown error' };

  if (err instanceof Error) {
    return {
      name: err.name,
      message: truncateString(err.message, maxLength),
      stack: err.stack ? truncateString(err.stack, maxLength) : undefined,
    };
  }

  if (typeof err === 'string') {
    return { message: truncateString(err, maxLength) };
  }

  if (typeof err === 'object') {
    return truncateForLog(err, maxLength);
  }

  return { error: String(err) };
}
