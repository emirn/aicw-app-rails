import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { SummarizeClickByPage } from "@/types/tinybird";
import { getAIServiceDisplayName } from "./use-summarize-clicks-overview";

export interface SummarizeClickPageData {
  pagePath: string;
  aiService: string;
  displayName: string;
  clickCount: number;
  uniqueSessions: number;
}

// Aggregated data per page (combining all AI services)
export interface SummarizeClickPageAggregated {
  pagePath: string;
  totalClicks: number;
  totalSessions: number;
  topAIService: string;
  topAIServiceDisplayName: string;
  breakdown: SummarizeClickPageData[];
}

interface UseSummarizeClicksByPageReturn {
  data: SummarizeClickPageData[];
  aggregatedData: SummarizeClickPageAggregated[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch summarize clicks grouped by page
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param limit - Optional limit for number of results
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useSummarizeClicksByPage(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  limit: number = 50,
  isPublic: boolean = false
): UseSummarizeClicksByPageReturn {
  const [data, setData] = useState<SummarizeClickPageData[]>([]);
  const [aggregatedData, setAggregatedData] = useState<SummarizeClickPageAggregated[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummarizeClicksByPage = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const pageData = await queryAnalytics<SummarizeClickByPage[]>(
        'summarize_clicks_by_page',
        {
          project_id: projectId,
          ...dateParams,
          limit,
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform raw data
      const transformedData: SummarizeClickPageData[] = (pageData || []).map((item) => ({
        pagePath: item.page_path,
        aiService: item.ai_service,
        displayName: getAIServiceDisplayName(item.ai_service),
        clickCount: Number(item.click_count || 0),
        uniqueSessions: Number(item.unique_sessions || 0),
      }));

      // Aggregate by page
      const pageMap = new Map<string, SummarizeClickPageAggregated>();
      transformedData.forEach((item) => {
        const existing = pageMap.get(item.pagePath);
        if (existing) {
          existing.totalClicks += item.clickCount;
          existing.totalSessions += item.uniqueSessions;
          existing.breakdown.push(item);
          // Update top AI service if this one has more clicks
          const topBreakdown = existing.breakdown.reduce((a, b) =>
            a.clickCount > b.clickCount ? a : b
          );
          existing.topAIService = topBreakdown.aiService;
          existing.topAIServiceDisplayName = topBreakdown.displayName;
        } else {
          pageMap.set(item.pagePath, {
            pagePath: item.pagePath,
            totalClicks: item.clickCount,
            totalSessions: item.uniqueSessions,
            topAIService: item.aiService,
            topAIServiceDisplayName: item.displayName,
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
    fetchSummarizeClicksByPage();
  }, [projectId, startDate, endDate, limit, isPublic]);

  return {
    data,
    aggregatedData,
    loading,
    error,
    refetch: fetchSummarizeClicksByPage,
  };
}
