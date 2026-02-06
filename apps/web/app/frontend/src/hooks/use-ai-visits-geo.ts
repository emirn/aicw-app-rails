import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { AIVisitsGeo } from "@/types/tinybird";

export interface AIVisitsGeoData {
  country: string;
  countryCode: string;
  pageviews: number;
  visitors: number;
  percentage: number;
}

interface UseAIVisitsGeoReturn {
  data: AIVisitsGeoData[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch geographic distribution of AI bot visits
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param refSourceFilter - Optional AI source filter (e.g., only ChatGPT visits)
 * @param pagePath - Optional page path filter
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useAIVisitsGeo(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  refSourceFilter?: string,
  pagePath?: string | null,
  isPublic: boolean = false
): UseAIVisitsGeoReturn {
  const [data, setData] = useState<AIVisitsGeoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAIVisitsGeo = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query Tinybird via Edge Function proxy
      const dateParams = buildDateRangeParams(startDate, endDate);
      const geoData = await queryAnalytics<AIVisitsGeo[]>(
        'ai_visits_geo',
        {
          project_id: projectId,
          ...dateParams,
          ref_source_filter: refSourceFilter !== undefined ? refSourceFilter : null,
          ...(pagePath ? { page_path: pagePath } : {}),
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform Tinybird response to match existing interface
      // Use country_code only - frontend resolves names via Intl.DisplayNames
      const transformedData: AIVisitsGeoData[] = (geoData || []).map((item) => ({
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
    fetchAIVisitsGeo();
  }, [projectId, startDate, endDate, refSourceFilter, pagePath, isPublic]);

  return {
    data,
    loading,
    error,
    refetch: fetchAIVisitsGeo,
  };
}
