import { useState, useEffect } from "react";
import { queryAnalytics, buildDateRangeParams } from "@/lib/analytics-client";
import type { ShareClickOverview as TinybirdShareClickOverview } from "@/types/tinybird";

// Display names for share services
const SHARE_SERVICE_DISPLAY_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  x: "X",
  gmail: "Gmail",
  telegram: "Telegram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  email: "Email",
  copy: "Copy Link",
};

export function getShareServiceDisplayName(serviceKey: string): string {
  return SHARE_SERVICE_DISPLAY_NAMES[serviceKey?.toLowerCase()] || serviceKey || "Unknown";
}

export interface ShareClickBreakdown {
  shareService: string;
  displayName: string;
  clickCount: number;
  uniqueSessions: number;
  percentage: number;
}

interface UseShareClicksOverviewReturn {
  data: ShareClickBreakdown[];
  totalClicks: number;
  totalSessions: number;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch share click overview by service
 * @param projectId - The project ID to fetch data for
 * @param startDate - Optional start date for date range filtering
 * @param endDate - Optional end date for date range filtering
 * @param isPublic - If true, uses public analytics endpoint (no auth required)
 */
export function useShareClicksOverview(
  projectId: string | undefined,
  startDate?: Date,
  endDate?: Date,
  isPublic: boolean = false
): UseShareClicksOverviewReturn {
  const [data, setData] = useState<ShareClickBreakdown[]>([]);
  const [totalClicks, setTotalClicks] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchShareClicksOverview = async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateRangeParams(startDate, endDate);
      const overviewData = await queryAnalytics<TinybirdShareClickOverview[]>(
        'share_clicks_overview',
        {
          project_id: projectId,
          ...dateParams,
        },
        isPublic ? 'public' : 'authenticated'
      );

      // Transform Tinybird response
      const transformedData: ShareClickBreakdown[] = (overviewData || []).map((item) => ({
        shareService: item.share_service,
        displayName: getShareServiceDisplayName(item.share_service),
        clickCount: Number(item.click_count || 0),
        uniqueSessions: Number(item.unique_sessions || 0),
        percentage: Number(item.percentage || 0),
      }));

      // Calculate totals from transformed data
      const clicks = transformedData.reduce((sum, item) => sum + item.clickCount, 0);
      const sessions = transformedData.reduce((sum, item) => sum + item.uniqueSessions, 0);

      setData(transformedData);
      setTotalClicks(clicks);
      setTotalSessions(sessions);
    } catch (err) {
      setError(err as Error);
      setData([]);
      setTotalClicks(0);
      setTotalSessions(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShareClicksOverview();
  }, [projectId, startDate, endDate, isPublic]);

  return {
    data,
    totalClicks,
    totalSessions,
    loading,
    error,
    refetch: fetchShareClicksOverview,
  };
}
