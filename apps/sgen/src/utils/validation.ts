/**
 * Input validation utilities for API routes
 */

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate that a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate that a value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validate URL format (basic check)
 */
export function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate website_info object for plan generation
 */
export function validateWebsiteInfo(info: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!info || typeof info !== 'object') {
    return { valid: false, errors: [{ field: 'website_info', message: 'website_info is required and must be an object' }] };
  }

  const obj = info as Record<string, unknown>;

  if (!isValidUrl(obj.url)) {
    errors.push({ field: 'website_info.url', message: 'url must be a valid HTTP/HTTPS URL' });
  }

  if (!isNonEmptyString(obj.title)) {
    errors.push({ field: 'website_info.title', message: 'title is required and must be a non-empty string' });
  }

  if (!isNonEmptyString(obj.description)) {
    errors.push({ field: 'website_info.description', message: 'description is required and must be a non-empty string' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate article object for updates
 */
export function validateArticle(article: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!article || typeof article !== 'object') {
    return { valid: false, errors: [{ field: 'article', message: 'article is required and must be an object' }] };
  }

  const obj = article as Record<string, unknown>;

  if (!isNonEmptyString(obj.id)) {
    errors.push({ field: 'article.id', message: 'id is required and must be a non-empty string' });
  }

  if (typeof obj.content !== 'string') {
    errors.push({ field: 'article.content', message: 'content must be a string' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Format validation errors for API response
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => `${e.field}: ${e.message}`).join('; ');
}
