import { useState, useEffect, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import { calculatePreviousPeriod, calculateItemTrends, ItemTrend } from "@/lib/trend-utils";
import { getVisitorSourceDisplay } from "@/lib/ai-sources";
import type { AISourceBreakdown } from "./use-ai-sources-breakdown";
import type { SearchSourceBreakdown } from "./use-search-sources-breakdown";
import type { OtherSourceBreakdown } from "./use-other-sources-breakdown";

export interface UseSourceTrendsReturn {
  aiTrends: Map<string, ItemTrend>;
  searchTrends: Map<string, ItemTrend>;
  otherTrends: Map<string, ItemTrend>;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch previous period data and calculate trends for AI, Search, and Other sources.
 * Fetches all three source types in parallel for the previous period.
 */
export function useSourceTrends(
  projectId: string | undefined,
  dateRange: DateRange | undefined,
  currentAiData: AISourceBreakdown[] | undefined,
  currentSearchData: SearchSourceBreakdown[] | undefined,
  currentOtherData: OtherSourceBreakdown[] | undefined,
  isPublic: boolean = false
): UseSourceTrendsReturn {
  const [prevAiData, setPrevAiData] = useState<AISourceBreakdown[]>([]);
  const [prevSearchData, setPrevSearchData] = useState<SearchSourceBreakdown[]>([]);
  const [prevOtherData, setPrevOtherData] = useState<OtherSourceBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Calculate previous period dates
  const periodInfo = useMemo(() => calculatePreviousPeriod(dateRange), [dateRange]);

  // Fetch previous period data for all source types
  useEffect(() => {
    if (!projectId || !periodInfo) {
      setPrevAiData([]);
      setPrevSearchData([]);
      setPrevOtherData([]);
      return;
    }

    const fetchPreviousData = async () => {
      setLoading(true);
      setError(null);

      const dateParams = buildDateRangeParams(periodInfo.from, periodInfo.to);
      const mode = isPublic ? 'public' : 'authenticated';

      try {
        // Fetch all three source types in parallel
        const [aiData, searchData, otherData] = await Promise.all([
          queryAnalytics<any[]>('ai_sources_breakdown', { project_id: projectId, ...dateParams }, mode),
          queryAnalytics<any[]>('search_sources_breakdown', { project_id: projectId, ...dateParams }, mode),
          queryAnalytics<any[]>('other_sources_breakdown', { project_id: projectId, ...dateParams, limit: 13 }, mode),
        ]);

        // Transform AI data
        const transformedAi: AISourceBreakdown[] = (aiData || []).map((item) => ({
          refSource: item.ref_source,
          display_name: getVisitorSourceDisplay(item.ref_source),
          pageviews: Number(item.pageviews || 0),
          visitors: Number(item.visitors || 0),
          percentage: Number(item.percentage || 0),
        }));

        // Transform Search data
        const transformedSearch: SearchSourceBreakdown[] = (searchData || []).map((item) => ({
          refSource: item.ref_source,
          display_name: getVisitorSourceDisplay(item.ref_source),
          pageviews: Number(item.pageviews || 0),
          visitors: Number(item.visitors || 0),
          percentage: Number(item.percentage || 0),
        }));

        // Transform Other data
        const transformedOther: OtherSourceBreakdown[] = (otherData || []).map((item) => ({
          refSource: item.ref_source,
          display_name: item.ref_source?.replace(/^www\./, '') || item.ref_source,
          pageviews: Number(item.pageviews || 0),
          visitors: Number(item.visitors || 0),
          percentage: Number(item.percentage || 0),
        }));

        setPrevAiData(transformedAi);
        setPrevSearchData(transformedSearch);
        setPrevOtherData(transformedOther);
      } catch (err) {
        console.error('Error fetching previous source data:', err);
        setError(err as Error);
        setPrevAiData([]);
        setPrevSearchData([]);
        setPrevOtherData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPreviousData();
  }, [projectId, periodInfo?.from?.getTime(), periodInfo?.to?.getTime(), isPublic]);

  // Calculate trends for each source type
  const aiTrends = useMemo(() => {
    const current = (currentAiData || []).map(d => ({ key: d.refSource, value: d.visitors }));
    const previous = prevAiData.map(d => ({ key: d.refSource, value: d.visitors }));
    return calculateItemTrends(current, previous);
  }, [currentAiData, prevAiData]);

  const searchTrends = useMemo(() => {
    const current = (currentSearchData || []).map(d => ({ key: d.refSource, value: d.visitors }));
    const previous = prevSearchData.map(d => ({ key: d.refSource, value: d.visitors }));
    return calculateItemTrends(current, previous);
  }, [currentSearchData, prevSearchData]);

  const otherTrends = useMemo(() => {
    const current = (currentOtherData || []).map(d => ({ key: d.refSource, value: d.visitors }));
    const previous = prevOtherData.map(d => ({ key: d.refSource, value: d.visitors }));
    return calculateItemTrends(current, previous);
  }, [currentOtherData, prevOtherData]);

  return { aiTrends, searchTrends, otherTrends, loading, error };
}
