import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, TrendingUp, Users, Activity } from "lucide-react";
import { getSourceIconUrl } from "@/lib/ai-sources";
import { getAISourceColor, getAISourceBgColor } from "@/lib/ai-colors";
import { AISourceBreakdown } from "@/hooks/use-ai-sources-breakdown";
import { formatPercent } from "@/lib/format";

interface AISourceCardProps {
  source: AISourceBreakdown;
  onClick?: () => void;
}

/**
 * AI Source Card component for Dashboard v2
 * Gorgeous card design with proper AI brand colors, favicons, and metrics
 */
export function AISourceCard({ source, onClick }: AISourceCardProps) {
  const hasVisits = source.pageviews > 0;
  const brandColor = getAISourceColor(source.refSource);
  const bgColor = getAISourceBgColor(source.refSource);

  return (
    <Card
      className={`group relative overflow-hidden transition-all duration-300 ${
        hasVisits
          ? "cursor-pointer hover:shadow-xl hover:-translate-y-2 border-2"
          : "opacity-60 border-2"
      }`}
      style={{
        borderColor: hasVisits ? brandColor : "hsl(var(--border))",
      }}
      onClick={() => hasVisits && onClick?.()}
    >
      {/* Background gradient overlay */}
      {hasVisits && (
        <div
          className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity"
          style={{ background: `linear-gradient(135deg, ${brandColor}, transparent)` }}
        />
      )}

      <CardHeader className="relative pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {/* AI Favicon - Larger and prominent */}
            <div
              className="relative flex items-center justify-center w-16 h-16 rounded-2xl shadow-md"
              style={{ backgroundColor: bgColor }}
            >
              <img
                src={getSourceIconUrl(source.refSource, false, 64)}
                alt={`${source.display_name} icon`}
                className="w-10 h-10 object-contain"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (!img.src.includes("sz=32")) {
                    img.src = getSourceIconUrl(source.refSource, false, 32);
                  }
                }}
              />
            </div>

            <div>
              <CardTitle className="text-xl font-bold mb-1">{source.display_name}</CardTitle>
              {hasVisits && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {formatPercent(source.percentage)} of AI traffic
                </p>
              )}
            </div>
          </div>
          {hasVisits && (
            <ChevronRight className="w-6 h-6 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          )}
        </div>
      </CardHeader>

      <CardContent className="relative">
        <div className="space-y-4">
          {/* Main metric - Visit count */}
          <div>
            <div
              className="text-5xl font-bold mb-2 tracking-tight"
              style={{ color: hasVisits ? brandColor : "hsl(var(--muted-foreground))" }}
            >
              {source.pageviews.toLocaleString()}
            </div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Total Visits
            </p>
          </div>

          {hasVisits ? (
            <>
              {/* Secondary metrics grid */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <p className="text-xs font-medium uppercase">Sessions</p>
                  </div>
                  <p className="text-2xl font-bold">{source.visitors.toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Activity className="w-4 h-4" />
                    <p className="text-xs font-medium uppercase">Share</p>
                  </div>
                  <p className="text-2xl font-bold">{formatPercent(source.percentage, 0)}</p>
                </div>
              </div>

              {/* Action button */}
              <Button
                variant="outline"
                className="w-full mt-4 font-semibold group-hover:bg-accent group-hover:text-accent-foreground transition-colors"
                size="lg"
                style={{
                  borderColor: brandColor,
                  color: brandColor,
                }}
              >
                View Detailed Analytics →
              </Button>
            </>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground border-t rounded-lg bg-muted/30">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No visits recorded yet</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
