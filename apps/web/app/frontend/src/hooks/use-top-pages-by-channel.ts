import { useState, useEffect } from "react";
import { getVisitorSourceDisplay } from "@/lib/ai-sources";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { TopPageByChannel, TrafficChannel } from "@/types/tinybird";

export interface TopPageByChannelData {
  pagePath: string;
  pageTitle: string;
  // Totals
  totalPageviews: number;
  totalVisitors: number;
  // Channel breakdown (pageviews)
  directPageviews: number;
  searchPageviews: number;
  aiPageviews: number;
  otherPageviews: number;
  // Channel breakdown (visitors)
  directVisitors: number;
  searchVisitors: number;
  aiVisitors: number;
  otherVisitors: number;
  // Percentages
  directPercent: number;
  searchPercent: number;
  aiPercent: number;
  otherPercent: number;
  // Top sources (up to 5)
  topAiSources: Array<{
    name: string;      // Internal name (e.g., "OpenAI ChatGPT")
    displayName: string; // Display name from ai-sources.ts
  }>;
  topSearchSources?: Array<{
    name: string;      // Source name (e.g., "Google")
    displayName: string;
  }>;
  topOtherSources?: Array<{
    name: string;      // Domain name
    displayName: string;
  }>;
}

interface UseTopPagesByChannelReturn {
  data: TopPageByChannelData[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch top pages with channel breakdown (AI, Search, Direct, Other)
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param limit - Maximum number of pages to return (default: 20)
 * @param pagePath - Optional page path filter
 * @param channelFilter - Optional channel filter ('ai', 'search', 'direct', 'other')
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2)
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useTopPagesByChannel(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  limit: number = 20,
  pagePath?: string | null,
  channelFilter?: TrafficChannel[],
  countryFilter?: string | null,
  isPublic: boolean = false
): UseTopPagesByChannelReturn {
  const [data, setData] = useState<TopPageByChannelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTopPagesByChannel = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const pagesData = await queryAnalytics<TopPageByChannel[]>(
        'top_pages_by_channel',
        {
          project_id: projectId,
          ...dateParams,
          limit,
          ...(pagePath ? { page_path: pagePath } : {}),
          ...(channelFilter && channelFilter.length > 0 ? { channels: channelFilter.join(',') } : {}),
          ...(countryFilter ? { country_code: countryFilter } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform Tinybird response
      const transformedData: TopPageByChannelData[] = (pagesData || []).map((item) => {
        const total = Number(item.total_visitors || 0);
        const direct = Number(item.direct_visitors || 0);
        const search = Number(item.search_visitors || 0);
        const ai = Number(item.ai_visitors || 0);
        const other = Number(item.other_visitors || 0);

        return {
          pagePath: item.page_path || "/",
          pageTitle: item.page_title || "",
          totalPageviews: Number(item.total_pageviews || 0),
          totalVisitors: total,
          directPageviews: Number(item.direct_pageviews || 0),
          searchPageviews: Number(item.search_pageviews || 0),
          aiPageviews: Number(item.ai_pageviews || 0),
          otherPageviews: Number(item.other_pageviews || 0),
          directVisitors: direct,
          searchVisitors: search,
          aiVisitors: ai,
          otherVisitors: other,
          directPercent: total > 0 ? Math.round((direct / total) * 100) : 0,
          searchPercent: total > 0 ? Math.round((search / total) * 100) : 0,
          aiPercent: total > 0 ? Math.round((ai / total) * 100) : 0,
          otherPercent: total > 0 ? Math.round((other / total) * 100) : 0,
          topAiSources: (item.top_ai_sources || "")
            .split(',')
            .filter(Boolean)
            .map(name => ({
              name,
              displayName: getVisitorSourceDisplay(name),
            })),
          topSearchSources: (item.top_search_sources || "")
            .split(',')
            .filter(Boolean)
            .map(name => ({
              name,
              displayName: getVisitorSourceDisplay(name),
            })),
          topOtherSources: (item.top_other_sources || "")
            .split(',')
            .filter(Boolean)
            .map(domain => ({
              name: domain,
              displayName: domain, // Use domain as display name
            })),
        };
      });

      setData(transformedData);
    } catch (err) {
      setError(err as Error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopPagesByChannel();
  }, [projectId, startDate, endDate, limit, pagePath, JSON.stringify(channelFilter), countryFilter, isPublic]);

  return {
    data,
    loading,
    error,
    refetch: fetchTopPagesByChannel,
  };
}
