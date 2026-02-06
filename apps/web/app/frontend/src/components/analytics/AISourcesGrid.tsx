import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { AISourceCard } from "./AISourceCard";
import { AISourceBreakdown } from "@/hooks/use-ai-sources-breakdown";

interface AISourcesGridProps {
  data: AISourceBreakdown[];
  loading?: boolean;
  error?: Error | null;
  onSourceClick?: (refSource: string, display_name: string) => void;
}

/**
 * AI Sources Grid component for Dashboard v2
 * Displays AI platforms as visual cards in a grid layout
 */
export function AISourcesGrid({
  data,
  loading,
  error,
  onSourceClick,
}: AISourcesGridProps) {
  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">AI Platform Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="border-2">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-[120px]" />
                    <Skeleton className="h-3 w-[80px]" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-12 w-full mb-4" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Platform Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load AI platform data. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Platform Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            No AI-driven visits detected in this time period.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">AI Platform Overview</h2>
        <p className="text-muted-foreground mt-1">
          Click on any platform to see detailed analytics
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.map((source) => (
          <AISourceCard
            key={source.refSource}
            source={source}
            onClick={() => onSourceClick?.(source.refSource, source.display_name)}
          />
        ))}
      </div>
    </div>
  );
}
