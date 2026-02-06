import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MousePointerClick, Users, Share2 } from "lucide-react";
import { ShareClickBreakdown } from "@/hooks/use-share-clicks-overview";
import { getShareServiceFaviconUrl, getShareServiceColor } from "@/lib/ai-service-icons";

interface ShareStatsGridProps {
  data: ShareClickBreakdown[];
  totalClicks: number;
  totalSessions: number;
  loading?: boolean;
  error?: Error | null;
  timeframe?: string;
}

export function ShareStatsGrid({
  data,
  totalClicks,
  totalSessions,
  loading,
  error,
  timeframe = "All time",
}: ShareStatsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Failed to load share click data.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Find top share service
  const topService = data.length > 0 ? data[0] : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* Total Clicks */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <MousePointerClick className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">Total Shares</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">
            {totalClicks.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">{timeframe}</p>
        </CardContent>
      </Card>

      {/* Unique Sessions */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Users className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-sm font-medium">Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-500">
            {totalSessions.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">unique visitors</p>
        </CardContent>
      </Card>

      {/* Top Share Service */}
      {topService && (
        <Card
          className="border-l-4"
          style={{ borderLeftColor: getShareServiceColor(topService.shareService) }}
        >
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Share2
              className="h-4 w-4"
              style={{ color: getShareServiceColor(topService.shareService) }}
            />
            <CardTitle className="text-sm font-medium">Top Service</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              style={{ color: getShareServiceColor(topService.shareService) }}
            >
              {topService.displayName}
            </div>
            <p className="text-xs text-muted-foreground">
              {topService.clickCount.toLocaleString()} clicks (
              {topService.percentage.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Per-service breakdown cards (show up to 3 more services) */}
      {data.slice(topService ? 1 : 0, topService ? 4 : 3).map((service) => (
        <Card
          key={service.shareService}
          className="border-l-4"
          style={{ borderLeftColor: getShareServiceColor(service.shareService) }}
        >
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <img
              src={getShareServiceFaviconUrl(service.shareService, 32)}
              alt={`${service.displayName} icon`}
              className="w-4 h-4 rounded flex-shrink-0"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                const fallback = document.createElement('div');
                fallback.className = 'w-4 h-4 rounded-full flex-shrink-0';
                fallback.style.backgroundColor = getShareServiceColor(service.shareService);
                target.parentNode?.insertBefore(fallback, target);
              }}
            />
            <CardTitle className="text-sm font-medium">
              {service.displayName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              style={{ color: getShareServiceColor(service.shareService) }}
            >
              {service.clickCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {service.percentage.toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
      ))}

      {/* Fill empty slots */}
      {data.length === 0 && (
        <Card className="col-span-4 opacity-60 border-dashed">
          <CardContent className="flex items-center justify-center h-24">
            <p className="text-sm text-muted-foreground">
              No share click data yet
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
