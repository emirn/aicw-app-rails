import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getSourceIconUrl } from "@/lib/ai-sources";
import { AISourceBreakdown } from "@/hooks/use-ai-sources-breakdown";
import { formatPercent } from "@/lib/format";

interface AISourcesPanelProps {
  data: AISourceBreakdown[];
  loading?: boolean;
  error?: Error | null;
  onSourceClick?: (refSource: string) => void;
}

export function AISourcesPanel({
  data,
  loading,
  error,
  onSourceClick,
}: AISourcesPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top AI Traffic Sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-3 w-[80px]" />
              </div>
              <Skeleton className="h-6 w-[60px]" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top AI Traffic Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load AI traffic data. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top AI Traffic Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No AI-driven visits detected in this time period.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top AI Traffic Sources</CardTitle>
        <p className="text-sm text-muted-foreground">
          Visitors arriving from AI chatbots
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.map((source) => (
          <div
            key={source.refSource}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              onSourceClick
                ? "cursor-pointer hover:bg-accent"
                : ""
            }`}
            onClick={() => onSourceClick?.(source.refSource)}
          >
            {/* AI Source Icon */}
            <div className="flex-shrink-0">
              <img
                src={getSourceIconUrl(source.refSource, false, 32)}
                alt={`${source.display_name} icon`}
                className="h-10 w-10 rounded-full bg-muted p-1"
                onError={(e) => {
                  // Fallback to smaller size if larger fails
                  const img = e.target as HTMLImageElement;
                  if (!img.src.includes("sz=16")) {
                    img.src = getSourceIconUrl(source.refSource, false, 16);
                  }
                }}
              />
            </div>

            {/* Source Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm truncate">
                  {source.display_name}
                </h4>
                <Badge variant="secondary" className="text-xs">
                  {formatPercent(source.percentage)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground">
                  {source.pageviews.toLocaleString()} pageviews
                </p>
                <span className="text-xs text-muted-foreground">•</span>
                <p className="text-xs text-muted-foreground">
                  {source.visitors.toLocaleString()} visitors
                </p>
              </div>
            </div>

            {/* Visit Count Badge */}
            <div className="flex-shrink-0 text-right">
              <Badge variant="outline" className="font-semibold">
                {source.pageviews.toLocaleString()}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
