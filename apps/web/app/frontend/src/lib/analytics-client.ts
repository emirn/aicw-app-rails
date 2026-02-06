import { apiClient } from './api-client'

/**
 * Analytics query mode
 * - 'authenticated': Requires user session, validates project ownership
 * - 'public': No auth required, validates enable_public_page = true
 */
export type AnalyticsMode = 'authenticated' | 'public';

/**
 * Query a Tinybird pipe via Rails API (authenticated, project-scoped)
 */
async function queryAuthenticated<T>(pipe: string, params: Record<string, any>): Promise<T> {
  const { project_id, ...rest } = params;
  const response = await apiClient.post<{ data: T }>(`/api/v1/projects/${project_id}/analytics/query`, {
    pipe,
    ...rest
  });
  return response.data;
}

/**
 * Query a Tinybird pipe via Rails API (public, domain-based, no auth)
 */
async function queryPublic<T>(pipe: string, params: Record<string, any>): Promise<T> {
  const response = await fetch('/api/v1/analytics/public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipe, ...params })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || 'Analytics query failed');
  }
  const result = await response.json();
  return result.data;
}

/**
 * Unified analytics query function that routes to the correct endpoint based on mode
 */
export async function queryAnalytics<T = any>(
  pipeName: string,
  params: Record<string, any>,
  mode: AnalyticsMode = 'authenticated'
): Promise<T> {
  if (mode === 'public') {
    return queryPublic<T>(pipeName, params);
  }
  return queryAuthenticated<T>(pipeName, params);
}

/**
 * Query public analytics and return full response (including meta)
 */
export async function queryPublicAnalytics<T = any>(
  pipeName: string,
  params: Record<string, any>
): Promise<T> {
  const response = await fetch('/api/v1/analytics/public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipe: pipeName, ...params })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    if (response.status === 404) {
      throw new Error('Public analytics not enabled for this project');
    }
    throw new Error(errorData.error || `Public analytics query failed`);
  }
  const result = await response.json();
  return result;
}

/**
 * Helper to format date for Tinybird queries
 */
export function formatDateForTinybird(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  return date.toISOString();
}

/**
 * Helper to build date range params for Tinybird queries
 */
export function buildDateRangeParams(startDate?: Date, endDate?: Date) {
  return {
    start_date: formatDateForTinybird(startDate),
    end_date: formatDateForTinybird(endDate)
  };
}
