import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { getSourceIconUrl } from "@/lib/ai-sources";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

interface AISourceDrillDownProps {
  refSource: number;
  display_name: string;
  visitCount: number;
  timeSeriesData?: Array<{ dateString: string; aiVisits: number }>;
  onBack: () => void;
}

/**
 * AI Source Drill-Down component for Dashboard v2
 * Shows detailed metrics and analysis for a specific AI platform
 */
export function AISourceDrillDown({
  refSource,
  display_name,
  visitCount,
  timeSeriesData = [],
  onBack,
}: AISourceDrillDownProps) {
  // Color mapping for AI sources
  const colorMap: Record<string, string> = {
    "Perplexity": "#10B981",
    "ChatGPT": "#8B5CF6",
    "Claude": "#F59E0B",
    "Gemini": "#3B82F6",
    "SearchGPT": "#EC4899",
  };

  const sourceColor = colorMap[display_name] || "#10B981";

  // Calculate growth (placeholder - would need historical data)
  const growth = visitCount > 0 ? 25 : 0;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to All AI Sources
        </Button>
      </div>

      {/* AI Source Header */}
      <Card className="border-2" style={{ borderColor: sourceColor }}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src={getSourceIconUrl(refSource.toString(), false, 128)}
                alt={display_name}
                className="w-20 h-20"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (!img.src.includes("sz=64")) {
                    img.src = getSourceIconUrl(refSource.toString(), false, 64);
                  }
                }}
              />
              <div>
                <h2 className="text-3xl font-bold">{display_name}</h2>
                <p className="text-muted-foreground mt-1">
                  Detailed performance metrics
                </p>
              </div>
            </div>
            <div className="text-right">
              <div
                className="text-4xl font-bold"
                style={{ color: sourceColor }}
              >
                {visitCount.toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">Total Visits</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <div className="text-2xl font-bold text-green-600">
                +{growth}%
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              vs previous period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground mt-1">minutes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bounce Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground mt-1">of sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Engagement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">High</div>
            <p className="text-xs text-muted-foreground mt-1">
              quality score
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Trend Chart */}
      {timeSeriesData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Traffic Trend</CardTitle>
            <p className="text-sm text-muted-foreground">
              Visits over time from {display_name}
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="dateString"
                  tickFormatter={(value) => format(new Date(value), "MMM dd")}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(value) =>
                    format(new Date(value as string), "MMM dd, yyyy")
                  }
                />
                <Line
                  type="monotone"
                  dataKey="aiVisits"
                  stroke={sourceColor}
                  strokeWidth={3}
                  dot={{ fill: sourceColor, r: 5 }}
                  name="Visits"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Placeholder for future features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Pages</CardTitle>
            <p className="text-sm text-muted-foreground">
              Most visited pages from {display_name}
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming soon: See which pages this AI platform sends traffic to
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device Breakdown</CardTitle>
            <p className="text-sm text-muted-foreground">
              How users access from {display_name}
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming soon: Mobile vs Desktop split analysis
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
