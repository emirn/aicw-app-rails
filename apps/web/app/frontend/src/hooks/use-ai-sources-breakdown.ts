import { useState, useEffect } from "react";
import { getVisitorSourceDisplay } from "@/lib/ai-sources";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { AISourceBreakdown as TinybirdAISourceBreakdown } from "@/types/tinybird";

export interface AISourceBreakdown {
  refSource: string;
  display_name: string;
  pageviews: number;
  visitors: number;
  percentage: number;
}

interface UseAISourcesBreakdownReturn {
  data: AISourceBreakdown[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch AI sources breakdown for a project
 * Returns visit counts and percentages for each AI bot
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param pagePath - Optional page path filter
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useAISourcesBreakdown(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  pagePath?: string | null,
  countryFilter?: string | null,
  isPublic: boolean = false
): UseAISourcesBreakdownReturn {
  const [data, setData] = useState<AISourceBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAISourcesBreakdown = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query Tinybird via Edge Function proxy
      const dateParams = buildDateRangeParams(startDate, endDate);
      const breakdownData = await queryAnalytics<TinybirdAISourceBreakdown[]>(
        'ai_sources_breakdown',
        {
          project_id: projectId,
          ...dateParams,
          ...(pagePath ? { page_path: pagePath } : {}),
          ...(countryFilter ? { country_code: countryFilter } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform Tinybird response to match existing interface
      const transformedData: AISourceBreakdown[] = (breakdownData || []).map((item) => ({
        refSource: item.ref_source,
        display_name: getVisitorSourceDisplay(item.ref_source),
        pageviews: Number(item.pageviews || 0),
        visitors: Number(item.visitors || 0),
        percentage: Number(item.percentage || 0),
      }));

      setData(transformedData);
    } catch (err) {
      setError(err as Error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAISourcesBreakdown();
  }, [projectId, startDate, endDate, pagePath, countryFilter, isPublic]);

  return {
    data,
    loading,
    error,
    refetch: fetchAISourcesBreakdown,
  };
}
