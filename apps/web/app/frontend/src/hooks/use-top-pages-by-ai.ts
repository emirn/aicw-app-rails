import { useState, useEffect } from "react";
import { getVisitorSourceDisplay } from "@/lib/ai-sources";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { TopPage } from "@/types/tinybird";

export interface TopPageData {
  pagePath: string;
  pageTitle: string;
  totalPageviews: number;
  totalVisitors: number;
  aiPageviews: number;
  aiVisitors: number;
  aiPercentage: number;
  topAiSource: string;
  topAiSourceName: string;
}

interface UseTopPagesByAIReturn {
  data: TopPageData[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch top pages sorted by AI traffic
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param limit - Maximum number of pages to return (default: 10)
 */
export function useTopPagesByAI(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  limit: number = 10
): UseTopPagesByAIReturn {
  const [data, setData] = useState<TopPageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTopPagesByAI = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query Tinybird via Edge Function proxy
      const dateParams = buildDateRangeParams(startDate, endDate);
      const pagesData = await queryAnalytics<TopPage[]>(
        'top_pages',
        {
          project_id: projectId,
          ...dateParams,
          limit: limit,
        }
      );

      // Transform Tinybird response to match existing interface
      const transformedData: TopPageData[] = (pagesData || []).map((item) => ({
        pagePath: item.page_path || "/",
        pageTitle: item.page_title || "",
        totalPageviews: Number(item.total_pageviews || 0),
        totalVisitors: Number(item.total_visitors || 0),
        aiPageviews: Number(item.ai_pageviews || 0),
        aiVisitors: Number(item.ai_visitors || 0),
        aiPercentage: Number(item.ai_percentage || 0),
        topAiSource: item.top_ai_source || "",
        topAiSourceName: getVisitorSourceDisplay(item.top_ai_source || ""),
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
    fetchTopPagesByAI();
  }, [projectId, startDate, endDate, limit]);

  return {
    data,
    loading,
    error,
    refetch: fetchTopPagesByAI,
  };
}
