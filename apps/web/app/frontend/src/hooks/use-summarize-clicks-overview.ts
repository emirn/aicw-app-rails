import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { SummarizeClickOverview as TinybirdSummarizeClickOverview } from "@/types/tinybird";

// Display names for AI services in summarize bar
const AI_SERVICE_DISPLAY_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
};

export function getAIServiceDisplayName(serviceKey: string): string {
  return AI_SERVICE_DISPLAY_NAMES[serviceKey?.toLowerCase()] || serviceKey || "Unknown";
}

export interface SummarizeClickBreakdown {
  aiService: string;
  displayName: string;
  clickCount: number;
  uniqueSessions: number;
  percentage: number;
}

interface UseSummarizeClicksOverviewReturn {
  data: SummarizeClickBreakdown[];
  totalClicks: number;
  totalSessions: number;
  totalOpens: number;
  clickThroughRate: number;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch summarize click overview by AI service
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useSummarizeClicksOverview(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  isPublic: boolean = false
): UseSummarizeClicksOverviewReturn {
  const [data, setData] = useState<SummarizeClickBreakdown[]>([]);
  const [totalClicks, setTotalClicks] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalOpens, setTotalOpens] = useState(0);
  const [clickThroughRate, setClickThroughRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummarizeClicksOverview = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const overviewData = await queryAnalytics<TinybirdSummarizeClickOverview[]>(
        'summarize_clicks_overview',
        {
          project_id: projectId,
          ...dateParams,
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform Tinybird response
      const transformedData: SummarizeClickBreakdown[] = (overviewData || []).map((item) => ({
        aiService: item.ai_service,
        displayName: getAIServiceDisplayName(item.ai_service),
        clickCount: Number(item.click_count || 0),
        uniqueSessions: Number(item.unique_sessions || 0),
        percentage: Number(item.percentage || 0),
      }));

      // Calculate totals from transformed data
      const clicks = transformedData.reduce((sum, item) => sum + item.clickCount, 0);
      const sessions = transformedData.reduce((sum, item) => sum + item.uniqueSessions, 0);

      // Extract opens and CTR from first row (same for all rows since they're aggregate CTEs)
      const opens = overviewData && overviewData.length > 0 ? Number(overviewData[0].total_opens || 0) : 0;
      const ctr = overviewData && overviewData.length > 0 ? Number(overviewData[0].click_through_rate || 0) : 0;

      setData(transformedData);
      setTotalClicks(clicks);
      setTotalSessions(sessions);
      setTotalOpens(opens);
      setClickThroughRate(ctr);
    } catch (err) {
      setError(err as Error);
      setData([]);
      setTotalClicks(0);
      setTotalSessions(0);
      setTotalOpens(0);
      setClickThroughRate(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummarizeClicksOverview();
  }, [projectId, startDate, endDate, isPublic]);

  return {
    data,
    totalClicks,
    totalSessions,
    totalOpens,
    clickThroughRate,
    loading,
    error,
    refetch: fetchSummarizeClicksOverview,
  };
}
