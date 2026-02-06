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
import { AIVisitsTimeSeriesData } from "@/hooks/use-ai-visits-time-series";
import { format } from "date-fns";
import { TrendingUp } from "lucide-react";
import { formatPercent } from "@/lib/format";

interface TimeSeriesChartProps {
  data: AIVisitsTimeSeriesData[];
  loading?: boolean;
  error?: Error | null;
}

export function TimeSeriesChart({ data, loading, error }: TimeSeriesChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Visits Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] sm:h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Visits Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load time-series data. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Visits Over Time</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[220px] sm:h-[300px] text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            No time-series data available for this period.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate growth metrics
  const firstDataPoint = data[0];
  const lastDataPoint = data[data.length - 1];
  const totalVisitorsGrowth =
    firstDataPoint && lastDataPoint && firstDataPoint.totalVisitors > 0
      ? ((lastDataPoint.totalVisitors - firstDataPoint.totalVisitors) / firstDataPoint.totalVisitors) * 100
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>AI-Driven Visitors Over Time</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Track AI chatbot referral trends
            </p>
          </div>
          {totalVisitorsGrowth !== 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Period Growth</p>
              <p
                className={`text-sm font-semibold ${
                  totalVisitorsGrowth > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {totalVisitorsGrowth > 0 ? "+" : ""}
                {formatPercent(totalVisitorsGrowth)}
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0.1} />
                <stop offset="95%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorAI" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
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
                  const data = payload[0].payload as AIVisitsTimeSeriesData;
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-3">
                      <p className="font-semibold mb-2">
                        {format(new Date(data.dateString), "MMM dd, yyyy")}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: "hsl(142, 76%, 36%)" }}
                          />
                          <span className="text-sm font-semibold">
                            AI Visitors: {data.aiVisitors.toLocaleString()} ({formatPercent(data.aiPercentage)})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: "hsl(220, 70%, 50%)", opacity: 0.5 }}
                          />
                          <span className="text-sm text-muted-foreground">
                            All Traffic: {data.totalVisitors.toLocaleString()}
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
              formatter={(value) => (
                <span className="text-sm">{value}</span>
              )}
            />
            <Area
              type="monotone"
              dataKey="aiVisitors"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={3}
              fill="url(#colorAI)"
              name="AI-Driven Visitors"
            />
            <Area
              type="monotone"
              dataKey="totalVisitors"
              stroke="hsl(220, 70%, 50%)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              fill="url(#colorTotal)"
              name="All Traffic"
              opacity={0.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
