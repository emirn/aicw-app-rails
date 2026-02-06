import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Share2 } from "lucide-react";
import { ShareClickBreakdown } from "@/hooks/use-share-clicks-overview";
import { getShareServiceFaviconUrl, getShareServiceColor } from "@/lib/ai-service-icons";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface ShareServiceChartProps {
  data: ShareClickBreakdown[];
  loading?: boolean;
  error?: Error | null;
}

export function ShareServiceChart({
  data,
  loading,
  error,
}: ShareServiceChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Share Service Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Share Service Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load service breakdown.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Share Service Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center">
          <Share2 className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground">
            No share click data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((item) => ({
    name: item.displayName,
    value: item.clickCount,
    color: getShareServiceColor(item.shareService),
    percentage: item.percentage,
    sessions: item.uniqueSessions,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-primary" />
          <CardTitle>Share Service Breakdown</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Distribution of shares across services
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie Chart */}
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-3">
                        <p className="font-semibold">{data.name}</p>
                        <p className="text-sm">
                          {data.value.toLocaleString()} shares ({data.percentage.toFixed(1)}%)
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {data.sessions.toLocaleString()} unique sessions
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* List breakdown */}
          <div className="space-y-3">
            {data.map((service) => (
              <div
                key={service.shareService}
                className="flex items-center gap-3 p-3 rounded-lg border"
              >
                <img
                  src={getShareServiceFaviconUrl(service.shareService, 32)}
                  alt={`${service.displayName} icon`}
                  className="w-5 h-5 rounded flex-shrink-0"
                  onError={(e) => {
                    // Fallback to colored dot on error
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const fallback = document.createElement('div');
                    fallback.className = 'w-5 h-5 rounded-full flex-shrink-0';
                    fallback.style.backgroundColor = getShareServiceColor(service.shareService);
                    target.parentNode?.insertBefore(fallback, target);
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {service.displayName}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {service.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {service.clickCount.toLocaleString()} shares •{" "}
                    {service.uniqueSessions.toLocaleString()} sessions
                  </p>
                </div>
                <Badge variant="outline" className="font-semibold">
                  {service.clickCount.toLocaleString()}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
