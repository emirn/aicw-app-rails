import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { ShareClickTimeSeries } from "@/types/tinybird";

export interface ShareClickTrendData {
  date: Date;
  dateString: string;
  clicks: number;
  uniqueSessions: number;
}

interface UseShareClicksTimeseriesReturn {
  data: ShareClickTrendData[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export type TimeInterval = "day" | "week" | "month";

/**
 * Hook to fetch share click time-series data
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param interval - Time interval for aggregation (day, week, month)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useShareClicksTimeseries(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  interval: TimeInterval = "day",
  isPublic: boolean = false
): UseShareClicksTimeseriesReturn {
  const [data, setData] = useState<ShareClickTrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchShareClicksTrend = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const trendData = await queryAnalytics<ShareClickTimeSeries[]>(
        'share_clicks_timeseries',
        {
          project_id: projectId,
          ...dateParams,
          interval,
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Create a map of existing data by date string (YYYY-MM-DD)
      const dataMap = new Map<string, ShareClickTimeSeries>();
      (trendData || []).forEach(item => {
        const dateStr = item.date_bucket.split('T')[0];
        dataMap.set(dateStr, item);
      });

      // Generate all dates in the range and fill missing with zeros
      const filledData: ShareClickTrendData[] = [];
      if (startDate && endDate) {
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);

        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          const existing = dataMap.get(dateStr);

          if (existing) {
            filledData.push({
              date: new Date(current),
              dateString: dateStr,
              clicks: Number(existing.clicks || 0),
              uniqueSessions: Number(existing.unique_sessions || 0),
            });
          } else {
            // Fill missing date with zeros
            filledData.push({
              date: new Date(current),
              dateString: dateStr,
              clicks: 0,
              uniqueSessions: 0,
            });
          }

          current.setDate(current.getDate() + 1);
        }
      } else {
        // No date range specified, just transform raw data
        (trendData || []).forEach((item) => {
          filledData.push({
            date: new Date(item.date_bucket),
            dateString: item.date_bucket,
            clicks: Number(item.clicks || 0),
            uniqueSessions: Number(item.unique_sessions || 0),
          });
        });
      }

      setData(filledData);
    } catch (err) {
      setError(err as Error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShareClicksTrend();
  }, [projectId, startDate, endDate, interval, isPublic]);

  return {
    data,
    loading,
    error,
    refetch: fetchShareClicksTrend,
  };
}
