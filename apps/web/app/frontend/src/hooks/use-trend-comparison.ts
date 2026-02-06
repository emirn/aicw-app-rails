import { useState, useEffect, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import { calculatePreviousPeriod, calculateTrends, ChannelTrend, PreviousPeriodInfo } from "@/lib/trend-utils";

interface TrafficSourceData {
  source_category: string;
  visitors: number;
}

export interface UseTrendComparisonReturn {
  trends: ChannelTrend[];
  periodLabel: string;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch previous period data and calculate trends.
 * Compares current period traffic data to the equivalent previous period.
 *
 * @param projectId - The project ID to query
 * @param dateRange - Current selected date range
 * @param currentData - Current period traffic source data
 * @param isPublic - Whether to use public or authenticated API
 */
export function useTrendComparison(
  projectId: string | undefined,
  dateRange: DateRange | undefined,
  currentData: TrafficSourceData[] | undefined,
  isPublic: boolean = false
): UseTrendComparisonReturn {
  const [previousData, setPreviousData] = useState<TrafficSourceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Calculate previous period dates
  const periodInfo = useMemo<PreviousPeriodInfo | undefined>(
    () => calculatePreviousPeriod(dateRange),
    [dateRange]
  );

  // Fetch previous period data
  useEffect(() => {
    // Reset if no project or period info
    if (!projectId || !periodInfo) {
      setPreviousData([]);
      setError(null);
      return;
    }

    const fetchPreviousData = async () => {
      setLoading(true);
      setError(null);

      try {
        const dateParams = buildDateRangeParams(periodInfo.from, periodInfo.to);

        const data = await queryAnalytics<any[]>(
          'traffic_sources',
          { project_id: projectId, ...dateParams },
          isPublic ? 'public' : 'authenticated'
        );

        // Transform data to normalized format
        const transformed: TrafficSourceData[] = (data || []).map((item) => ({
          source_category: normalizeCategory(item.source_category),
          visitors: Number(item.visitors || 0)
        }));

        setPreviousData(transformed);
      } catch (err) {
        console.error('Error fetching previous period data:', err);
        setError(err as Error);
        setPreviousData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPreviousData();
  }, [projectId, periodInfo?.from?.getTime(), periodInfo?.to?.getTime(), isPublic]);

  // Calculate trends from current and previous data
  const trends = useMemo(() => {
    // Normalize current data to match expected format
    const normalizedCurrent: TrafficSourceData[] = (currentData || []).map(item => ({
      source_category: normalizeCategory(item.source_category),
      visitors: Number(item.visitors || 0)
    }));

    return calculateTrends(normalizedCurrent, previousData);
  }, [currentData, previousData]);

  // Generate period label
  const periodLabel = useMemo(() => {
    if (!periodInfo) return '';
    return `vs prev ${periodInfo.durationDays} day${periodInfo.durationDays === 1 ? '' : 's'}`;
  }, [periodInfo]);

  return { trends, periodLabel, loading, error };
}

/**
 * Normalize category names to consistent lowercase format.
 * Maps 'referral' to 'other' for consistency with UI.
 */
function normalizeCategory(category: string | undefined): string {
  if (!category) return 'other';
  const lower = category.toLowerCase();
  return lower === 'referral' ? 'other' : lower;
}
