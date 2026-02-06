import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AISourceBreakdown } from "@/hooks/use-ai-sources-breakdown";
import { getSourceIconUrl } from "@/lib/ai-sources";

interface AIComparisonChartProps {
  data: AISourceBreakdown[];
  loading?: boolean;
}

/**
 * AI Comparison Chart component for Dashboard v2
 * Shows horizontal bar chart comparing all AI platforms side-by-side
 */
export function AIComparisonChart({ data, loading }: AIComparisonChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Platform Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] sm:h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  // Color mapping for AI sources
  const colorMap: Record<string, string> = {
    "Perplexity": "#10B981",
    "ChatGPT": "#8B5CF6",
    "Claude": "#F59E0B",
    "Gemini": "#3B82F6",
    "SearchGPT": "#EC4899",
  };

  // Transform data for horizontal bar chart
  const chartData = [
    {
      metric: "Visits",
      ...data.reduce((acc, source) => ({
        ...acc,
        [source.display_name]: source.pageviews,
      }), {}),
    },
    {
      metric: "Sessions",
      ...data.reduce((acc, source) => ({
        ...acc,
        [source.display_name]: source.visitors,
      }), {}),
    },
    {
      metric: "Engagement %",
      ...data.reduce((acc, source) => ({
        ...acc,
        [source.display_name]: Math.round(source.percentage),
      }), {}),
    },
  ];

  // Get all AI source names for bar configuration
  const aiSourceNames = data.map(s => s.display_name);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Platform Comparison</CardTitle>
        <p className="text-sm text-muted-foreground">
          Compare performance across all AI sources
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis
              dataKey="metric"
              type="category"
              width={100}
              tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Legend
              verticalAlign="top"
              height={40}
              iconType="circle"
              formatter={(value) => {
                const source = data.find(s => s.display_name === value);
                if (source) {
                  return (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <img
                        src={getSourceIconUrl(source.refSource, false, 16)}
                        alt={value}
                        className="w-4 h-4 inline-block"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      {value}
                    </span>
                  );
                }
                return <span className="text-sm">{value}</span>;
              }}
            />
            {aiSourceNames.map((name) => (
              <Bar
                key={name}
                dataKey={name}
                fill={colorMap[name] || "#10B981"}
                radius={[0, 4, 4, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
