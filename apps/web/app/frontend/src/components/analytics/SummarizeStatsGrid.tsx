import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MousePointerClick, Users, Sparkles } from "lucide-react";
import { SummarizeClickBreakdown } from "@/hooks/use-summarize-clicks-overview";
import { getServiceColor } from "@/lib/ai-service-icons";

interface SummarizeStatsGridProps {
  data: SummarizeClickBreakdown[];
  totalClicks: number;
  totalSessions: number;
  loading?: boolean;
  error?: Error | null;
  timeframe?: string;
}

export function SummarizeStatsGrid({
  data,
  totalClicks,
  totalSessions,
  loading,
  error,
  timeframe = "All time",
}: SummarizeStatsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
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
            Failed to load summarize click data.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Find top AI service
  const topService = data.length > 0 ? data[0] : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Total Clicks */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <MousePointerClick className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
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

      {/* Top AI Service */}
      {topService ? (
        <Card
          className="border-l-4"
          style={{ borderLeftColor: getServiceColor(topService.aiService) }}
        >
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Sparkles
              className="h-4 w-4"
              style={{ color: getServiceColor(topService.aiService) }}
            />
            <CardTitle className="text-sm font-medium">Top Service</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              style={{ color: getServiceColor(topService.aiService) }}
            >
              {topService.displayName}
            </div>
            <p className="text-xs text-muted-foreground">
              {topService.clickCount.toLocaleString()} clicks (
              {topService.percentage.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-l-4 border-l-muted opacity-60 border-dashed">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Top Service</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
