import { useState, useEffect } from "react";
import { getVisitorSourceDisplay } from "@/lib/ai-sources";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { AnalyticsOverview, TrafficChannel } from "@/types/tinybird";

export interface AuthenticatedAnalyticsData {
  totalPageviews: number;
  totalVisitors: number;
  aiPageviews: number;
  aiVisitors: number;
  aiPercentage: number;
  topAiSource: string;
  topAiSourceId: string | null; // Source name for icon display
  topAiSourcePageviews: number;
  topAiSourceVisitors: number;
  totalCountries: number;
  totalPages: number;
  projectId: string;
  projectName: string;
  domain: string;
}

interface UseAuthenticatedAnalyticsReturn {
  data: AuthenticatedAnalyticsData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch authenticated analytics data for a project
 * Requires authentication and project ownership
 * @param projectId - The project ID to fetch analytics for
 * @param projectName - The project name (passed in from project context)
 * @param domain - The project domain (passed in from project context)
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param pagePath - Optional page path filter
 * @param channelFilter - Optional channel filter array (multi-select)
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useAuthenticatedAnalytics(
  projectId: string | undefined,
  projectName: string | undefined,
  domain: string | undefined,
  startDate?: Date,
  endDate?: Date,
  pagePath?: string | null,
  channelFilter?: TrafficChannel[],
  countryFilter?: string | null,
  isPublic: boolean = false
): UseAuthenticatedAnalyticsReturn {
  const [data, setData] = useState<AuthenticatedAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAuthenticatedAnalytics = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query Tinybird via Edge Function proxy
      const dateParams = buildDateRangeParams(startDate, endDate);
      const analyticsData = await queryAnalytics<AnalyticsOverview[]>(
        'analytics_overview',
        {
          project_id: projectId,
          ...dateParams,
          ...(pagePath ? { page_path: pagePath } : {}),
          ...(channelFilter && channelFilter.length > 0 ? { channels: channelFilter.join(',') } : {}),
          ...(countryFilter ? { country_code: countryFilter } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Tinybird returns an array with a single row
      const analytics = analyticsData && Array.isArray(analyticsData) && analyticsData.length > 0
        ? analyticsData[0]
        : null;

      if (!analytics) {
        // No data yet - project might be new
        setData({
          totalPageviews: 0,
          totalVisitors: 0,
          aiPageviews: 0,
          aiVisitors: 0,
          aiPercentage: 0,
          topAiSource: "-",
          topAiSourceId: null,
          topAiSourcePageviews: 0,
          topAiSourceVisitors: 0,
          totalCountries: 0,
          totalPages: 0,
          projectId: projectId,
          projectName: projectName || "",
          domain: domain || "",
        });
        return;
      }

      const totalPageviews = Number(analytics.total_pageviews || 0);
      const totalVisitors = Number(analytics.total_visitors || 0);
      const aiPageviews = Number(analytics.ai_pageviews || 0);
      const aiVisitors = Number(analytics.ai_visitors || 0);
      const aiPercentage = analytics.ai_percentage || 0;
      const totalCountries = Number(analytics.unique_countries || 0);
      const totalPages = Number(analytics.unique_pages || 0);
      const topAiSourcePageviews = Number(analytics.top_ai_source_pageviews || 0);
      const topAiSourceVisitors = Number(analytics.top_ai_source_visitors || 0);

      // Get display name and ID for top AI source
      const topAiSourceId = analytics.top_ai_source_id ? analytics.top_ai_source_id : null;
      const topAiSource = topAiSourceId !== null
        ? getVisitorSourceDisplay(topAiSourceId)
        : "-";

      setData({
        totalPageviews,
        totalVisitors,
        aiPageviews,
        aiVisitors,
        aiPercentage,
        topAiSource,
        topAiSourceId,
        topAiSourcePageviews,
        topAiSourceVisitors,
        totalCountries,
        totalPages,
        projectId: projectId,
        projectName: projectName || "",
        domain: domain || "",
      });
    } catch (err) {
      setError(err as Error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthenticatedAnalytics();
  }, [projectId, projectName, domain, startDate, endDate, pagePath, JSON.stringify(channelFilter), countryFilter, isPublic]);

  return {
    data,
    loading,
    error,
    refetch: fetchAuthenticatedAnalytics,
  };
}
