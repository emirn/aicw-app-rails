import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";

export interface OtherSourceBreakdown {
  refSource: string;
  display_name: string;
  pageviews: number;
  visitors: number;
  percentage: number;
}

interface TinybirdOtherSourceBreakdown {
  ref_source: string;
  pageviews: number;
  visitors: number;
  percentage: number;
}

interface UseOtherSourcesBreakdownReturn {
  data: OtherSourceBreakdown[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch other sources breakdown for a project
 * Returns top referrer domains not categorized as AI or Search
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param limit - Maximum number of sources to return (default: 13)
 * @param pagePath - Optional page path filter
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useOtherSourcesBreakdown(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  limit: number = 13,
  pagePath?: string | null,
  countryFilter?: string | null,
  isPublic: boolean = false
): UseOtherSourcesBreakdownReturn {
  const [data, setData] = useState<OtherSourceBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOtherSourcesBreakdown = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query Tinybird via Edge Function proxy
      const dateParams = buildDateRangeParams(startDate, endDate);
      const breakdownData = await queryAnalytics<TinybirdOtherSourceBreakdown[]>(
        'other_sources_breakdown',
        {
          project_id: projectId,
          ...dateParams,
          limit,
          ...(pagePath ? { page_path: pagePath } : {}),
          ...(countryFilter ? { country_code: countryFilter } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform Tinybird response to match interface
      // For other sources, display_name is the cleaned domain (without www.)
      const transformedData: OtherSourceBreakdown[] = (breakdownData || []).map((item) => ({
        refSource: item.ref_source,
        display_name: item.ref_source.replace(/^www\./, ''),
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
    fetchOtherSourcesBreakdown();
  }, [projectId, startDate, endDate, limit, pagePath, countryFilter, isPublic]);

  return {
    data,
    loading,
    error,
    refetch: fetchOtherSourcesBreakdown,
  };
}
