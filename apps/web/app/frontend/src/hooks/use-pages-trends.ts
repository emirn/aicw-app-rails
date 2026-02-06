import { useState, useEffect, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import { calculatePreviousPeriod, calculateItemTrends, ItemTrend } from "@/lib/trend-utils";
import type { TopPageByChannelData } from "./use-top-pages-by-channel";

export interface UsePagesTrendsReturn {
  pageTrends: Map<string, ItemTrend>;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch previous period pages data and calculate trends.
 * Matches pages by pagePath and calculates trend for totalVisitors.
 */
export function usePagesTrends(
  projectId: string | undefined,
  dateRange: DateRange | undefined,
  currentData: TopPageByChannelData[] | undefined,
  isPublic: boolean = false
): UsePagesTrendsReturn {
  const [prevData, setPrevData] = useState<TopPageByChannelData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Calculate previous period dates
  const periodInfo = useMemo(() => calculatePreviousPeriod(dateRange), [dateRange]);

  // Fetch previous period pages data
  useEffect(() => {
    if (!projectId || !periodInfo) {
      setPrevData([]);
      return;
    }

    const fetchPreviousData = async () => {
      setLoading(true);
      setError(null);

      try {
        const dateParams = buildDateRangeParams(periodInfo.from, periodInfo.to);
        const pagesData = await queryAnalytics<any[]>(
          'top_pages_by_channel',
          {
            project_id: projectId,
            ...dateParams,
            limit: 50, // Fetch more to ensure we have previous data for current pages
          },
          isPublic ? 'public' : 'authenticated'
        );

        // Transform to match interface (we only need pagePath and totalVisitors)
        const transformedData: TopPageByChannelData[] = (pagesData || []).map((item) => ({
          pagePath: item.page_path || "/",
          pageTitle: item.page_title || "",
          totalPageviews: Number(item.total_pageviews || 0),
          totalVisitors: Number(item.total_visitors || 0),
          directPageviews: 0,
          searchPageviews: 0,
          aiPageviews: 0,
          otherPageviews: 0,
          directVisitors: 0,
          searchVisitors: 0,
          aiVisitors: 0,
          otherVisitors: 0,
          directPercent: 0,
          searchPercent: 0,
          aiPercent: 0,
          otherPercent: 0,
          topAiSources: [],
        }));

        setPrevData(transformedData);
      } catch (err) {
        console.error('Error fetching previous pages data:', err);
        setError(err as Error);
        setPrevData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPreviousData();
  }, [projectId, periodInfo?.from?.getTime(), periodInfo?.to?.getTime(), isPublic]);

  // Calculate trends - match by pagePath, compare totalVisitors
  const pageTrends = useMemo(() => {
    const current = (currentData || []).map(d => ({
      key: d.pagePath,
      value: d.totalVisitors
    }));
    const previous = prevData.map(d => ({
      key: d.pagePath,
      value: d.totalVisitors
    }));
    return calculateItemTrends(current, previous);
  }, [currentData, prevData]);

  return { pageTrends, loading, error };
}
