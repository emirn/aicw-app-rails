import { useState, useEffect, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import { calculatePreviousPeriod, calculateItemTrends, ItemTrend } from "@/lib/trend-utils";
import type { VisitsGeoData } from "./use-visits-geo";
import type { TrafficChannel } from "@/types/tinybird";

export interface UseGeoTrendsReturn {
  countryTrends: Map<string, ItemTrend>;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch previous period geo data and calculate country trends.
 * Only calculates trends for the top 12 countries displayed.
 */
export function useGeoTrends(
  projectId: string | undefined,
  dateRange: DateRange | undefined,
  currentData: VisitsGeoData[] | undefined,
  channelFilter?: TrafficChannel[],
  isPublic: boolean = false
): UseGeoTrendsReturn {
  const [prevData, setPrevData] = useState<VisitsGeoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Calculate previous period dates
  const periodInfo = useMemo(() => calculatePreviousPeriod(dateRange), [dateRange]);

  // Fetch previous period geo data
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
        const geoData = await queryAnalytics<any[]>(
          'visits_geo',
          {
            project_id: projectId,
            ...dateParams,
            ...(channelFilter && channelFilter.length > 0 ? { channels: channelFilter.join(',') } : {}),
          },
          isPublic ? 'public' : 'authenticated'
        );

        const transformedData: VisitsGeoData[] = (geoData || []).map((item) => ({
          country: item.country_code || "ZZ",
          countryCode: item.country_code,
          pageviews: Number(item.pageviews || 0),
          visitors: Number(item.visitors || 0),
          percentage: Number(item.percentage || 0),
        }));

        setPrevData(transformedData);
      } catch (err) {
        console.error('Error fetching previous geo data:', err);
        setError(err as Error);
        setPrevData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPreviousData();
  }, [projectId, periodInfo?.from?.getTime(), periodInfo?.to?.getTime(), JSON.stringify(channelFilter), isPublic]);

  // Calculate trends - only for countries in current data (top 12)
  const countryTrends = useMemo(() => {
    // Use countryCode as the key for matching
    const current = (currentData || []).map(d => ({
      key: d.countryCode,
      value: d.visitors
    }));
    const previous = prevData.map(d => ({
      key: d.countryCode,
      value: d.visitors
    }));
    return calculateItemTrends(current, previous);
  }, [currentData, prevData]);

  return { countryTrends, loading, error };
}
