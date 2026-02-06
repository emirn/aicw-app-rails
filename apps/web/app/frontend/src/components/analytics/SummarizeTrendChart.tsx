import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { SummarizeClickTrendData } from "@/hooks/use-summarize-clicks-timeseries";
import { format } from "date-fns";
import { TrendingUp } from "lucide-react";

interface SummarizeTrendChartProps {
  data: SummarizeClickTrendData[];
  loading?: boolean;
  error?: Error | null;
}

export function SummarizeTrendChart({
  data,
  loading,
  error,
}: SummarizeTrendChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Clicks Over Time</CardTitle>
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
          <CardTitle>Clicks Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load trend data.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Clicks Over Time</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground">
            No trend data available for this period.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate growth metrics
  const firstDataPoint = data.find((d) => d.clicks > 0);
  const lastDataPoint = [...data].reverse().find((d) => d.clicks > 0);
  const totalClicks = data.reduce((sum, d) => sum + d.clicks, 0);
  const growthPercent =
    firstDataPoint && lastDataPoint && firstDataPoint.clicks > 0
      ? ((lastDataPoint.clicks - firstDataPoint.clicks) / firstDataPoint.clicks) *
        100
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <CardTitle>Summarize Clicks Over Time</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Daily summarize button clicks trend
            </p>
          </div>
          <div className="text-right space-y-1">
            <div>
              <p className="text-xs text-muted-foreground">Total Clicks</p>
              <p className="text-lg font-bold text-primary">
                {totalClicks.toLocaleString()}
              </p>
            </div>
            {growthPercent !== 0 && (
              <p
                className={`text-xs font-semibold ${
                  growthPercent > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {growthPercent > 0 ? "+" : ""}
                {growthPercent.toFixed(1)}% period growth
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="dateString"
              tickFormatter={(value) => format(new Date(value), "MMM dd")}
              tick={{ fontSize: 12 }}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as SummarizeClickTrendData;
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-3">
                      <p className="font-semibold mb-2">
                        {format(new Date(data.dateString), "MMM dd, yyyy")}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: "hsl(262, 83%, 58%)" }}
                          />
                          <span className="text-sm font-semibold">
                            Clicks: {data.clicks.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: "hsl(220, 70%, 50%)" }}
                          />
                          <span className="text-sm text-muted-foreground">
                            Sessions: {data.uniqueSessions.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              formatter={(value) => <span className="text-sm">{value}</span>}
            />
            <Area
              type="monotone"
              dataKey="clicks"
              stroke="hsl(262, 83%, 58%)"
              strokeWidth={3}
              fill="url(#colorClicks)"
              name="Clicks"
            />
            <Area
              type="monotone"
              dataKey="uniqueSessions"
              stroke="hsl(220, 70%, 50%)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              fill="url(#colorSessions)"
              name="Sessions"
              opacity={0.7}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
