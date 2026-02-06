import { useState, useEffect } from "react";
import { getVisitorSourceDisplay } from "@/lib/ai-sources";
import { queryPublicAnalytics } from "@/lib/analytics-client";
import type { AnalyticsOverview } from "@/types/tinybird";

export interface PublicAnalyticsData {
  totalPageviews: number;
  totalVisitors: number;
  aiPageviews: number;
  aiVisitors: number;
  aiPercentage: number;
  topAiSource: string;
  projectName: string;
  domain: string;
}

interface UsePublicAnalyticsReturn {
  data: PublicAnalyticsData | null;
  loading: boolean;
  error: Error | null;
  isPublicPageEnabled: boolean;
}

interface AnalyticsResponse {
  data: AnalyticsOverview[];
  meta?: {
    project_id: string;
    project_name: string;
    project_domain: string;
  };
}

/**
 * Hook to fetch public analytics data for a domain
 * Does not require authentication - used for public analytics pages
 * Routes through analytics-public edge function for CORS consistency
 * @param domain - The domain to fetch analytics for
 */
export function usePublicAnalytics(domain: string | undefined): UsePublicAnalyticsReturn {
  const [data, setData] = useState<PublicAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isPublicPageEnabled, setIsPublicPageEnabled] = useState(false);

  useEffect(() => {
    const fetchPublicAnalytics = async () => {
      if (!domain) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Query analytics via edge function (using domain for lookup)
        // Edge function returns both analytics data and project metadata
        const response = await queryPublicAnalytics<AnalyticsResponse>(
          'analytics_overview',
          { domain }
        );

        if (!response?.data) {
          // No data returned - project doesn't exist or public page is disabled
          setIsPublicPageEnabled(false);
          setData(null);
          setLoading(false);
          return;
        }

        setIsPublicPageEnabled(true);

        // Extract analytics from response
        const analytics = response.data.length > 0 ? response.data[0] : null;

        const totalPageviews = Number(analytics?.total_pageviews || 0);
        const totalVisitors = Number(analytics?.total_visitors || 0);
        const aiPageviews = Number(analytics?.ai_pageviews || 0);
        const aiVisitors = Number(analytics?.ai_visitors || 0);
        const aiPercentage = analytics?.ai_percentage || 0;

        // Get display name for top AI source
        const topAiSource = analytics?.top_ai_source_id
          ? getVisitorSourceDisplay(analytics.top_ai_source_id)
          : "-";

        // Get project info from response metadata
        const projectName = response.meta?.project_name || domain;
        const projectDomain = response.meta?.project_domain || domain;

        setData({
          totalPageviews,
          totalVisitors,
          aiPageviews,
          aiVisitors,
          aiPercentage,
          topAiSource,
          projectName,
          domain: projectDomain,
        });
      } catch (err) {
        setError(err as Error);
        setData(null);
        setIsPublicPageEnabled(false);
      } finally {
        setLoading(false);
      }
    };

    fetchPublicAnalytics();
  }, [domain]);

  return {
    data,
    loading,
    error,
    isPublicPageEnabled,
  };
}
