import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { TrafficTrendBySource } from "@/types/tinybird";

export interface SourceTrendDataPoint {
  dateString: string;
  [sourceKey: string]: number | string; // Dynamic keys for each source's visitor count
}

export interface SourceMetadata {
  sourceKey: string;
  channel: 'ai' | 'search' | 'direct' | 'other';
  totalVisitors: number;
}

interface UseTrafficTrendBySourceReturn {
  data: SourceTrendDataPoint[];
  sources: SourceMetadata[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export type TimeInterval = "day" | "week" | "month";

/**
 * Hook to fetch time-series data for traffic by individual source (top N sources)
 * Returns data in a format suitable for stacked area chart with dynamic sources
 *
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param interval - Time interval for aggregation (day, week, month)
 * @param pagePath - Optional page path filter
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2)
 * @param limit - Number of top sources to include (default: 12)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useTrafficTrendBySource(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  interval: TimeInterval = "day",
  pagePath?: string | null,
  countryFilter?: string | null,
  limit: number = 12,
  isPublic: boolean = false
): UseTrafficTrendBySourceReturn {
  const [data, setData] = useState<SourceTrendDataPoint[]>([]);
  const [sources, setSources] = useState<SourceMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const rawData = await queryAnalytics<TrafficTrendBySource[]>(
        'traffic_trend_by_source',
        {
          project_id: projectId,
          ...dateParams,
          interval,
          limit,
          ...(pagePath ? { page_path: pagePath } : {}),
          ...(countryFilter ? { country_code: countryFilter } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Identify unique sources and calculate their total visitors
      const sourceMap = new Map<string, { channel: 'ai' | 'search' | 'direct' | 'other'; total: number }>();
      (rawData || []).forEach(item => {
        const existing = sourceMap.get(item.source_key);
        if (existing) {
          existing.total += Number(item.visitors || 0);
        } else {
          sourceMap.set(item.source_key, {
            channel: item.channel,
            total: Number(item.visitors || 0)
          });
        }
      });

      // Convert to sorted array by total visitors (descending)
      const sourcesArray: SourceMetadata[] = Array.from(sourceMap.entries())
        .map(([key, val]) => ({
          sourceKey: key,
          channel: val.channel,
          totalVisitors: val.total
        }))
        .sort((a, b) => b.totalVisitors - a.totalVisitors);

      setSources(sourcesArray);

      // Pivot data: group by date, with each source as a column
      const dateMap = new Map<string, SourceTrendDataPoint>();

      (rawData || []).forEach(item => {
        const dateStr = item.date_bucket.split('T')[0];
        if (!dateMap.has(dateStr)) {
          // Initialize with all sources at 0
          const point: SourceTrendDataPoint = { dateString: dateStr };
          sourcesArray.forEach(s => {
            point[s.sourceKey] = 0;
          });
          dateMap.set(dateStr, point);
        }
        const point = dateMap.get(dateStr)!;
        point[item.source_key] = Number(item.visitors || 0);
      });

      // Fill in missing dates with zeros
      const filledData: SourceTrendDataPoint[] = [];
      if (startDate && endDate) {
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);

        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          if (dateMap.has(dateStr)) {
            filledData.push(dateMap.get(dateStr)!);
          } else {
            // Create empty point for this date
            const point: SourceTrendDataPoint = { dateString: dateStr };
            sourcesArray.forEach(s => {
              point[s.sourceKey] = 0;
            });
            filledData.push(point);
          }
          current.setDate(current.getDate() + 1);
        }
      } else {
        // No date range, use raw data order
        Array.from(dateMap.values())
          .sort((a, b) => a.dateString.localeCompare(b.dateString))
          .forEach(point => filledData.push(point));
      }

      setData(filledData);
    } catch (err) {
      setError(err as Error);
      setData([]);
      setSources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId, startDate, endDate, interval, pagePath, countryFilter, limit, isPublic]);

  return {
    data,
    sources,
    loading,
    error,
    refetch: fetchData,
  };
}
