import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { AIVisitsTimeSeries } from "@/types/tinybird";

export interface AIVisitsTimeSeriesData {
  date: Date;
  dateString: string;
  totalPageviews: number;
  totalVisitors: number;
  aiPageviews: number;
  aiVisitors: number;
  aiPercentage: number;
}

interface UseAIVisitsTimeSeriesReturn {
  data: AIVisitsTimeSeriesData[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export type TimeInterval = "day" | "week" | "month";

/**
 * Hook to fetch time-series data for AI bot visits
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param interval - Time interval for aggregation (day, week, month)
 */
export function useAIVisitsTimeSeries(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  interval: TimeInterval = "day"
): UseAIVisitsTimeSeriesReturn {
  const [data, setData] = useState<AIVisitsTimeSeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAIVisitsTimeSeries = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query Tinybird via Edge Function proxy
      const dateParams = buildDateRangeParams(startDate, endDate);
      const timeSeriesData = await queryAnalytics<AIVisitsTimeSeries[]>(
        'ai_visits_timeseries',
        {
          project_id: projectId,
          ...dateParams,
          time_interval: interval,
        }
      );

      // Transform Tinybird response to match existing interface
      const transformedData: AIVisitsTimeSeriesData[] = (timeSeriesData || []).map((item) => ({
        date: new Date(item.date_bucket),
        dateString: item.date_bucket,
        totalPageviews: Number(item.total_pageviews || 0),
        totalVisitors: Number(item.total_visitors || 0),
        aiPageviews: Number(item.ai_pageviews || 0),
        aiVisitors: Number(item.ai_visitors || 0),
        aiPercentage: Number(item.ai_percentage || 0),
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
    fetchAIVisitsTimeSeries();
  }, [projectId, startDate, endDate, interval]);

  return {
    data,
    loading,
    error,
    refetch: fetchAIVisitsTimeSeries,
  };
}
