import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { TrafficSource } from "@/types/tinybird";

export interface TrafficSourceBreakdownData {
  source_category: 'ai' | 'search' | 'direct' | 'other';
  pageviews: number;
  visitors: number;
  percentage: number;
  unique_pages: number;
  page_percentage: number;
}

interface UseTrafficSourceBreakdownReturn {
  data: TrafficSourceBreakdownData[];
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch traffic source breakdown (AI, Search, Direct, Other)
 * for a project with optional date range filtering
 * @param projectId - The project ID to fetch breakdown for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param pagePath - Optional page path filter
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useTrafficSourceBreakdown(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  pagePath?: string | null,
  countryFilter?: string | null,
  isPublic: boolean = false
): UseTrafficSourceBreakdownReturn {
  const [data, setData] = useState<TrafficSourceBreakdownData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchBreakdown = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Query Tinybird via Edge Function proxy
        const dateParams = buildDateRangeParams(startDate, endDate);
        const breakdownData = await queryAnalytics<TrafficSource[]>(
          'traffic_sources',
          {
            project_id: projectId,
            ...dateParams,
            ...(pagePath ? { page_path: pagePath } : {}),
            ...(countryFilter ? { country_code: countryFilter } : {}),
          },
          isPublic ? 'public' : 'authenticated'
        );

        // Transform Tinybird response to match existing interface
        const transformedData: TrafficSourceBreakdownData[] = (breakdownData || []).map((item) => {
          const category = item.source_category.toLowerCase();
          return {
            source_category: (category === 'referral' ? 'other' : category) as 'ai' | 'search' | 'direct' | 'other',
            pageviews: item.pageviews,
            visitors: item.visitors,
            percentage: item.percentage,
            unique_pages: item.unique_pages || 0,
            page_percentage: item.page_percentage || 0,
          };
        });

        setData(transformedData);
      } catch (err) {
        setError(err as Error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBreakdown();
  }, [projectId, startDate, endDate, pagePath, countryFilter, isPublic]);

  return {
    data,
    loading,
    error,
  };
}
