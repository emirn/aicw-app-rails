import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { ShareClickByPage } from "@/types/tinybird";
import { getShareServiceDisplayName } from "./use-share-clicks-overview";

export interface ShareClickPageData {
  pagePath: string;
  shareService: string;
  displayName: string;
  clickCount: number;
  uniqueSessions: number;
}

// Aggregated data per page (combining all share services)
export interface ShareClickPageAggregated {
  pagePath: string;
  totalClicks: number;
  totalSessions: number;
  topShareService: string;
  topShareServiceDisplayName: string;
  breakdown: ShareClickPageData[];
}

interface UseShareClicksByPageReturn {
  data: ShareClickPageData[];
  aggregatedData: ShareClickPageAggregated[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch share clicks grouped by page
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param limit - Optional limit for number of results
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useShareClicksByPage(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  limit: number = 50,
  isPublic: boolean = false
): UseShareClicksByPageReturn {
  const [data, setData] = useState<ShareClickPageData[]>([]);
  const [aggregatedData, setAggregatedData] = useState<ShareClickPageAggregated[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchShareClicksByPage = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const pageData = await queryAnalytics<ShareClickByPage[]>(
        'share_clicks_by_page',
        {
          project_id: projectId,
          ...dateParams,
          limit,
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform raw data
      const transformedData: ShareClickPageData[] = (pageData || []).map((item) => ({
        pagePath: item.page_path,
        shareService: item.share_service,
        displayName: getShareServiceDisplayName(item.share_service),
        clickCount: Number(item.click_count || 0),
        uniqueSessions: Number(item.unique_sessions || 0),
      }));

      // Aggregate by page
      const pageMap = new Map<string, ShareClickPageAggregated>();
      transformedData.forEach((item) => {
        const existing = pageMap.get(item.pagePath);
        if (existing) {
          existing.totalClicks += item.clickCount;
          existing.totalSessions += item.uniqueSessions;
          existing.breakdown.push(item);
          // Update top share service if this one has more clicks
          const topBreakdown = existing.breakdown.reduce((a, b) =>
            a.clickCount > b.clickCount ? a : b
          );
          existing.topShareService = topBreakdown.shareService;
          existing.topShareServiceDisplayName = topBreakdown.displayName;
        } else {
          pageMap.set(item.pagePath, {
            pagePath: item.pagePath,
            totalClicks: item.clickCount,
            totalSessions: item.uniqueSessions,
            topShareService: item.shareService,
            topShareServiceDisplayName: item.displayName,
            breakdown: [item],
          });
        }
      });

      // Sort aggregated data by total clicks
      const aggregated = Array.from(pageMap.values())
        .sort((a, b) => b.totalClicks - a.totalClicks);

      setData(transformedData);
      setAggregatedData(aggregated);
    } catch (err) {
      setError(err as Error);
      setData([]);
      setAggregatedData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShareClicksByPage();
  }, [projectId, startDate, endDate, limit, isPublic]);

  return {
    data,
    aggregatedData,
    loading,
    error,
    refetch: fetchShareClicksByPage,
  };
}
