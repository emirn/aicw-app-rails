import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { VisitsGeo, TrafficChannel } from "@/types/tinybird";

export interface VisitsGeoData {
  country: string;
  countryCode: string;
  pageviews: number;
  visitors: number;
  percentage: number;
}

interface UseVisitsGeoReturn {
  data: VisitsGeoData[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch geographic distribution of visits with optional channel filter
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param channelFilter - Optional channel filter ('ai', 'search', 'direct', 'other')
 * @param refSourceFilter - Optional specific source filter within a channel
 * @param pagePath - Optional page path filter
 * @param countryFilter - Optional country code filter (ISO 3166-1 alpha-2) - used for highlighting
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useVisitsGeo(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  channelFilter?: TrafficChannel[],
  refSourceFilter?: string,
  pagePath?: string | null,
  countryFilter?: string | null,
  isPublic: boolean = false
): UseVisitsGeoReturn {
  const [data, setData] = useState<VisitsGeoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVisitsGeo = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query Tinybird via Edge Function proxy
      const dateParams = buildDateRangeParams(startDate, endDate);
      const geoData = await queryAnalytics<VisitsGeo[]>(
        'visits_geo',
        {
          project_id: projectId,
          ...dateParams,
          ...(channelFilter && channelFilter.length > 0 ? { channels: channelFilter.join(',') } : {}),
          ...(refSourceFilter ? { ref_source_filter: refSourceFilter } : {}),
          ...(pagePath ? { page_path: pagePath } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform Tinybird response to match existing interface
      // Use country_code only - frontend resolves names via Intl.DisplayNames
      const transformedData: VisitsGeoData[] = (geoData || []).map((item) => ({
        country: item.country_code || "ZZ",
        countryCode: item.country_code,
        pageviews: Number(item.pageviews || 0),
        visitors: Number(item.visitors || 0),
        percentage: Number(item.percentage || 0),
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
    fetchVisitsGeo();
  }, [projectId, startDate, endDate, JSON.stringify(channelFilter), refSourceFilter, pagePath, countryFilter, isPublic]);

  return {
    data,
    loading,
    error,
    refetch: fetchVisitsGeo,
  };
}
