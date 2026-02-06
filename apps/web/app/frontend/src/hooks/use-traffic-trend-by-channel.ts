import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { TrafficTrendByChannel, TrafficChannel } from "@/types/tinybird";

export interface TrafficTrendData {
  date: Date;
  dateString: string;
  // Visitors by channel
  aiVisitors: number;
  searchVisitors: number;
  directVisitors: number;
  otherVisitors: number;
  totalVisitors: number;
  // Pageviews by channel
  aiPageviews: number;
  searchPageviews: number;
  directPageviews: number;
  otherPageviews: number;
  totalPageviews: number;
}

interface UseTrafficTrendByChannelReturn {
  data: TrafficTrendData[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export type TimeInterval = "day" | "week" | "month";

/**
 * Hook to fetch time-series data for traffic by channel (AI, Search, Direct, Other)
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param interval - Time interval for aggregation (day, week, month)
 * @param pagePath - Optional page path filter
 * @param channelFilter - Optional channel filter array (multi-select)
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useTrafficTrendByChannel(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  interval: TimeInterval = "day",
  pagePath?: string | null,
  channelFilter?: TrafficChannel[],
  countryFilter?: string | null,
  isPublic: boolean = false
): UseTrafficTrendByChannelReturn {
  const [data, setData] = useState<TrafficTrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrafficTrend = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const trendData = await queryAnalytics<TrafficTrendByChannel[]>(
        'traffic_trend_by_channel',
        {
          project_id: projectId,
          ...dateParams,
          interval,
          ...(pagePath ? { page_path: pagePath } : {}),
          ...(channelFilter && channelFilter.length > 0 ? { channels: channelFilter.join(',') } : {}),
          ...(countryFilter ? { country_code: countryFilter } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Create a map of existing data by date string (YYYY-MM-DD)
      const dataMap = new Map<string, TrafficTrendByChannel>();
      (trendData || []).forEach(item => {
        const dateStr = item.date_bucket.split('T')[0];
        dataMap.set(dateStr, item);
      });

      // Generate all dates in the range and fill missing with zeros
      const filledData: TrafficTrendData[] = [];
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
              aiVisitors: Number(existing.ai_visitors || 0),
              searchVisitors: Number(existing.search_visitors || 0),
              directVisitors: Number(existing.direct_visitors || 0),
              otherVisitors: Number(existing.other_visitors || 0),
              totalVisitors: Number(existing.total_visitors || 0),
              aiPageviews: Number(existing.ai_pageviews || 0),
              searchPageviews: Number(existing.search_pageviews || 0),
              directPageviews: Number(existing.direct_pageviews || 0),
              otherPageviews: Number(existing.other_pageviews || 0),
              totalPageviews: Number(existing.total_pageviews || 0),
            });
          } else {
            // Fill missing date with zeros
            filledData.push({
              date: new Date(current),
              dateString: dateStr,
              aiVisitors: 0,
              searchVisitors: 0,
              directVisitors: 0,
              otherVisitors: 0,
              totalVisitors: 0,
              aiPageviews: 0,
              searchPageviews: 0,
              directPageviews: 0,
              otherPageviews: 0,
              totalPageviews: 0,
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
            aiVisitors: Number(item.ai_visitors || 0),
            searchVisitors: Number(item.search_visitors || 0),
            directVisitors: Number(item.direct_visitors || 0),
            otherVisitors: Number(item.other_visitors || 0),
            totalVisitors: Number(item.total_visitors || 0),
            aiPageviews: Number(item.ai_pageviews || 0),
            searchPageviews: Number(item.search_pageviews || 0),
            directPageviews: Number(item.direct_pageviews || 0),
            otherPageviews: Number(item.other_pageviews || 0),
            totalPageviews: Number(item.total_pageviews || 0),
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
    fetchTrafficTrend();
  }, [projectId, startDate, endDate, interval, pagePath, JSON.stringify(channelFilter), countryFilter, isPublic]);

  return {
    data,
    loading,
    error,
    refetch: fetchTrafficTrend,
  };
}
