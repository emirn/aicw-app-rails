import { useState, useEffect, useCallback } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";

export interface CrawlerBreakdownItem {
  ref_bot: string;
  crawler_category: 'AI Crawler' | 'Generic Bot';
  visit_count: number;
  unique_sessions: number;
  visits_with_referrer: number;
}

interface UseCrawlerBreakdownReturn {
  data: CrawlerBreakdownItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch crawler/bot breakdown for a project
 * Returns visit counts for each bot type, categorized as AI Crawler or Generic Bot
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param pagePath - Optional page path filter
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useCrawlerBreakdown(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  pagePath?: string | null,
  countryFilter?: string | null,
  isPublic: boolean = false
): UseCrawlerBreakdownReturn {
  const [data, setData] = useState<CrawlerBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCrawlerBreakdown = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const breakdownData = await queryAnalytics<CrawlerBreakdownItem[]>(
        'crawler_breakdown',
        {
          project_id: projectId,
          ...dateParams,
          ...(pagePath ? { page_path: pagePath } : {}),
          ...(countryFilter ? { country_code: countryFilter } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Ensure numeric types
      const transformedData: CrawlerBreakdownItem[] = (breakdownData || []).map((item) => ({
        ref_bot: item.ref_bot,
        crawler_category: item.crawler_category,
        visit_count: Number(item.visit_count || 0),
        unique_sessions: Number(item.unique_sessions || 0),
        visits_with_referrer: Number(item.visits_with_referrer || 0),
      }));

      setData(transformedData);
    } catch (err) {
      setError(err as Error);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, startDate, endDate, pagePath, countryFilter, isPublic]);

  useEffect(() => {
    fetchCrawlerBreakdown();
  }, [fetchCrawlerBreakdown]);

  return {
    data,
    loading,
    error,
    refetch: fetchCrawlerBreakdown,
  };
}
