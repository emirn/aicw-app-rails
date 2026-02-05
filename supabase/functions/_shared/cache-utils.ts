/**
 * Analytics caching utilities
 * Provides PostgreSQL-based caching for Tinybird analytics responses
 *
 * Smart caching features:
 * - Covering cache: A cached 30-day entry can serve a 7-day request
 * - Date range aware: Entries store start/end dates for subset matching
 */

import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Create a deterministic hash from params for cache key generation
 * Filters out project_id (already in key) and sorts keys for consistency
 */
function createParamsHash(params: Record<string, unknown>): string {
  const sortedParams = Object.keys(params)
    .filter(key => key !== 'project_id')
    .sort()
    .reduce((obj, key) => {
      obj[key] = params[key];
      return obj;
    }, {} as Record<string, unknown>);
  return btoa(JSON.stringify(sortedParams)).slice(0, 32);
}

/**
 * Create a hash from filters ONLY (excludes dates and project_id)
 * Used for covering cache lookups where we want to find any cache
 * with matching filters regardless of date range
 */
export function createFiltersHash(params: Record<string, unknown>): string {
  const filterParams = Object.keys(params)
    .filter(key => !['project_id', 'start_date', 'end_date'].includes(key))
    .sort()
    .reduce((obj, key) => {
      obj[key] = params[key];
      return obj;
    }, {} as Record<string, unknown>);
  return btoa(JSON.stringify(filterParams)).slice(0, 32);
}

/**
 * Generate a unique cache key for an analytics request
 * Format: {projectId}:{pipeName}:{paramsHash}
 */
export function generateCacheKey(
  projectId: string,
  pipe: string,
  params: Record<string, unknown>
): string {
  const paramsHash = createParamsHash(params);
  return `${projectId}:${pipe}:${paramsHash}`;
}

/**
 * Try to get a cached response from the database
 * Returns { data, hit } where hit indicates if cache was valid
 */
export async function getCachedResponse(
  supabase: SupabaseClient,
  cacheKey: string
): Promise<{ data: unknown; hit: boolean }> {
  try {
    const { data, error } = await supabase.rpc('get_cached_analytics', {
      p_cache_key: cacheKey,
    });

    if (error) {
      console.error('[CACHE] Lookup error:', error.message);
      return { data: null, hit: false };
    }

    if (!data || data.length === 0 || !data[0].is_valid) {
      return { data: null, hit: false };
    }

    return { data: data[0].response_data, hit: true };
  } catch (e) {
    console.error('[CACHE] Lookup exception:', e);
    return { data: null, hit: false };
  }
}

/**
 * Store a response in the cache
 * This is fire-and-forget - errors are logged but don't block the response
 */
export async function setCachedResponse(
  supabase: SupabaseClient,
  cacheKey: string,
  projectId: string,
  pipe: string,
  params: Record<string, unknown>,
  responseData: unknown,
  ttlMinutes: number
): Promise<void> {
  try {
    const paramsHash = createParamsHash(params);
    const { error } = await supabase.rpc('set_cached_analytics', {
      p_cache_key: cacheKey,
      p_project_id: projectId,
      p_pipe_name: pipe,
      p_params_hash: paramsHash,
      p_response_data: responseData,
      p_ttl_minutes: ttlMinutes,
    });

    if (error) {
      console.error('[CACHE] Write error:', error.message);
    }
  } catch (e) {
    console.error('[CACHE] Write exception:', e);
    // Don't throw - cache write failure shouldn't break the request
  }
}

/**
 * Smart cache lookup: Find a cached response that COVERS the requested date range
 * Example: A cached 30-day entry can serve a 7-day request (sliced client-side)
 *
 * @returns { data, hit, startDate?, endDate? } where:
 *   - hit: true if a covering cache was found
 *   - startDate/endDate: the cached entry's date range (for slicing)
 */
export async function getCoveringCache(
  supabase: SupabaseClient,
  projectId: string,
  pipe: string,
  filtersHash: string,
  requestedStart: Date,
  requestedEnd: Date
): Promise<{ data: unknown; hit: boolean; startDate?: Date; endDate?: Date }> {
  try {
    const { data, error } = await supabase.rpc('get_covering_cache', {
      p_project_id: projectId,
      p_pipe_name: pipe,
      p_params_hash: filtersHash,
      p_requested_start: requestedStart.toISOString(),
      p_requested_end: requestedEnd.toISOString(),
    });

    if (error) {
      console.error('[CACHE] Covering lookup error:', error.message);
      return { data: null, hit: false };
    }

    if (!data || data.length === 0 || !data[0].is_valid) {
      return { data: null, hit: false };
    }

    return {
      data: data[0].response_data,
      hit: true,
      startDate: new Date(data[0].start_date),
      endDate: new Date(data[0].end_date),
    };
  } catch (e) {
    console.error('[CACHE] Covering lookup exception:', e);
    return { data: null, hit: false };
  }
}

/**
 * Store a response in the cache WITH date range info
 * This enables smart cache lookups for subset matching
 */
export async function setCachedResponseWithDates(
  supabase: SupabaseClient,
  projectId: string,
  pipe: string,
  filtersHash: string,
  startDate: Date,
  endDate: Date,
  responseData: unknown,
  ttlMinutes: number
): Promise<void> {
  try {
    // Cache key includes dates to ensure uniqueness
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);
    const cacheKey = `${projectId}:${pipe}:${filtersHash}:${startStr}:${endStr}`;

    const { error } = await supabase.rpc('set_cached_analytics_with_dates', {
      p_cache_key: cacheKey,
      p_project_id: projectId,
      p_pipe_name: pipe,
      p_params_hash: filtersHash,
      p_start_date: startDate.toISOString(),
      p_end_date: endDate.toISOString(),
      p_response_data: responseData,
      p_ttl_minutes: ttlMinutes,
    });

    if (error) {
      console.error('[CACHE] Write with dates error:', error.message);
    }
  } catch (e) {
    console.error('[CACHE] Write with dates exception:', e);
    // Don't throw - cache write failure shouldn't break the request
  }
}

/**
 * Slice Tinybird response data to a requested date range
 * Used when a covering cache returns more data than requested
 *
 * @param data - Tinybird response with { data: [...] } format
 * @param startDate - Requested start date
 * @param endDate - Requested end date
 * @returns Sliced response with only rows within the date range
 */
export function sliceDataToDateRange(
  data: unknown,
  startDate: Date,
  endDate: Date
): unknown {
  // Handle various response formats
  if (!data || typeof data !== 'object') {
    return data;
  }

  const response = data as { data?: unknown[] };

  // If no data array, return as-is
  if (!response.data || !Array.isArray(response.data)) {
    return data;
  }

  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  // Filter rows by date_bucket field (common in Tinybird time series)
  const sliced = response.data.filter((row: unknown) => {
    if (!row || typeof row !== 'object') return false;
    const rowObj = row as Record<string, unknown>;

    // Check for date_bucket field (time series data)
    if (rowObj.date_bucket && typeof rowObj.date_bucket === 'string') {
      const rowDate = rowObj.date_bucket.slice(0, 10);
      return rowDate >= startStr && rowDate <= endStr;
    }

    // Check for created_at field (raw events)
    if (rowObj.created_at && typeof rowObj.created_at === 'string') {
      const rowDate = rowObj.created_at.slice(0, 10);
      return rowDate >= startStr && rowDate <= endStr;
    }

    // No date field found - include the row
    return true;
  });

  return { ...response, data: sliced };
}
