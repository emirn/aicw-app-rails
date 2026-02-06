import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { TrafficTrendData } from "@/hooks/use-traffic-trend-by-channel";
import { SourceTrendDataPoint, SourceMetadata } from "@/hooks/use-traffic-trend-by-source";
import { AISourceBreakdown } from "@/hooks/use-ai-sources-breakdown";
import { SearchSourceBreakdown } from "@/hooks/use-search-sources-breakdown";
import { format } from "date-fns";
import { TrendingUp, Bot, Search, MousePointer, Globe } from "lucide-react";
import { formatPercent } from "@/lib/format";
import type { TrafficChannel } from "@/types/tinybird";
import { AISourceIcon } from "./AISourceIcon";

interface StackedTrafficChartProps {
  data: TrafficTrendData[];
  detailedData?: SourceTrendDataPoint[];
  detailedSources?: SourceMetadata[];
  detailedLoading?: boolean;
  aiSourcesData?: AISourceBreakdown[];
  searchSourcesData?: SearchSourceBreakdown[];
  loading?: boolean;
  error?: Error | null;
  channelFilter?: TrafficChannel[];
}

// Channel colors matching TrafficSourceComparison
const CHANNEL_COLORS = {
  ai: "hsl(142, 76%, 36%)",
  search: "hsl(217, 91%, 60%)",
  direct: "hsl(240, 5%, 65%)",
  other: "hsl(25, 95%, 53%)",
};

const CHANNEL_LABELS = {
  ai: "AI Referrals",
  search: "Search",
  direct: "Direct",
  other: "Other",
};

const CHANNEL_ICONS = {
  ai: Bot,
  search: Search,
  direct: MousePointer,
  other: Globe,
};

// Extended color palette for up to 12 sources (distinct, visually pleasant)
const SOURCE_COLORS = [
  "hsl(142, 76%, 36%)",  // Green (AI)
  "hsl(217, 91%, 60%)",  // Blue (Search)
  "hsl(25, 95%, 53%)",   // Orange (Other)
  "hsl(280, 65%, 60%)",  // Purple
  "hsl(340, 82%, 52%)",  // Pink
  "hsl(45, 93%, 47%)",   // Yellow
  "hsl(180, 70%, 45%)",  // Cyan
  "hsl(0, 72%, 51%)",    // Red
  "hsl(120, 40%, 50%)",  // Olive Green
  "hsl(240, 5%, 65%)",   // Gray (Direct)
  "hsl(200, 80%, 50%)",  // Sky Blue
  "hsl(310, 60%, 50%)",  // Magenta
];

// Helper to get color for a source based on its channel and index
const getSourceColor = (source: SourceMetadata, index: number): string => {
  // Use channel-specific colors for known channels
  if (source.channel === 'ai') return CHANNEL_COLORS.ai;
  if (source.channel === 'search') return CHANNEL_COLORS.search;
  if (source.channel === 'direct') return CHANNEL_COLORS.direct;
  // For 'other' sources, use rotating palette starting from index 2 (skip AI green and Search blue)
  return SOURCE_COLORS[(index + 2) % SOURCE_COLORS.length];
};

export function StackedTrafficChart({
  data,
  detailedData = [],
  detailedSources = [],
  detailedLoading,
  aiSourcesData = [],
  searchSourcesData = [],
  loading,
  error,
  channelFilter = [],
}: StackedTrafficChartProps) {
  const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);

  // Check if channel should be shown (empty filter = show all)
  const isChannelVisible = (channel: TrafficChannel): boolean => {
    if (channelFilter.length === 0) return true;
    return channelFilter.includes(channel);
  };

  // Determine if we should render detailed mode
  const isDetailedMode = showDetailedBreakdown && detailedSources.length > 0 && detailedData.length > 0;

  if (loading || (showDetailedBreakdown && detailedLoading)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Traffic Trend</CardTitle>
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
          <CardTitle>Traffic Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load traffic trend data. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Traffic Trend</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            No traffic data available for this period.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals for the period
  const totalVisitors = data.reduce((sum, d) => sum + d.totalVisitors, 0);

  // Determine if we have detailed breakdown data available
  const hasDetailedData = detailedSources.length > 0 || aiSourcesData.length > 0 || searchSourcesData.length > 0;

  // Choose the appropriate data for the chart
  const chartData = isDetailedMode ? detailedData : data;

  // Build source color map for detailed mode
  const sourceColorMap = new Map<string, string>();
  if (isDetailedMode) {
    detailedSources.forEach((source, index) => {
      sourceColorMap.set(source.sourceKey, getSourceColor(source, index));
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Traffic Trend</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isDetailedMode ? "Traffic by source over time" : "Traffic by channel over time"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {hasDetailedData && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="detailed-chart-breakdown"
                  checked={showDetailedBreakdown}
                  onCheckedChange={(checked) => setShowDetailedBreakdown(checked === true)}
                />
                <Label
                  htmlFor="detailed-chart-breakdown"
                  className="text-sm font-normal cursor-pointer"
                >
                  Detailed Breakdown
                </Label>
              </div>
            )}
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Visitors</p>
              <p className="text-sm font-semibold">{totalVisitors.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              {isDetailedMode ? (
                // Dynamic gradients for detailed sources
                detailedSources.map((source, index) => {
                  const color = getSourceColor(source, index);
                  const gradientId = `colorSource${index}`;
                  return (
                    <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.4} />
                    </linearGradient>
                  );
                })
              ) : (
                // Fixed gradients for channel mode
                <>
                  <linearGradient id="colorAiStacked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHANNEL_COLORS.ai} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={CHANNEL_COLORS.ai} stopOpacity={0.4} />
                  </linearGradient>
                  <linearGradient id="colorSearchStacked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHANNEL_COLORS.search} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={CHANNEL_COLORS.search} stopOpacity={0.4} />
                  </linearGradient>
                  <linearGradient id="colorDirectStacked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHANNEL_COLORS.direct} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={CHANNEL_COLORS.direct} stopOpacity={0.4} />
                  </linearGradient>
                  <linearGradient id="colorOtherStacked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHANNEL_COLORS.other} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={CHANNEL_COLORS.other} stopOpacity={0.4} />
                  </linearGradient>
                </>
              )}
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
                  if (isDetailedMode) {
                    // Detailed mode tooltip
                    const dateString = payload[0]?.payload?.dateString;
                    const dayTotal = payload.reduce((sum, p) => sum + (Number(p.value) || 0), 0);

                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-3 max-h-[300px] overflow-y-auto">
                        <p className="font-semibold mb-2">
                          {format(new Date(dateString), "MMM dd, yyyy")}
                        </p>
                        <div className="space-y-1">
                          {payload
                            .filter(entry => Number(entry.value) > 0)
                            .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
                            .map((entry, index) => (
                              <div key={index} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <span className="text-sm">{entry.name}</span>
                                </div>
                                <span className="text-sm font-semibold">
                                  {Number(entry.value).toLocaleString()}
                                  <span className="text-muted-foreground font-normal ml-1">
                                    ({dayTotal > 0 ? formatPercent((Number(entry.value) / dayTotal) * 100, 0) : '0%'})
                                  </span>
                                </span>
                              </div>
                            ))}
                          <div className="border-t pt-1 mt-1">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm font-medium">Total</span>
                              <span className="text-sm font-semibold">{dayTotal.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    // Channel mode tooltip (original)
                    const d = payload[0].payload as TrafficTrendData;
                    const dayTotal = d.totalVisitors;
                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-3">
                        <p className="font-semibold mb-2">
                          {format(new Date(d.dateString), "MMM dd, yyyy")}
                        </p>
                        <div className="space-y-1">
                          {isChannelVisible('ai') && (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: CHANNEL_COLORS.ai }}
                                />
                                <span className="text-sm">{CHANNEL_LABELS.ai}</span>
                              </div>
                              <span className="text-sm font-semibold">
                                {d.aiVisitors.toLocaleString()}
                                <span className="text-muted-foreground font-normal ml-1">
                                  ({dayTotal > 0 ? formatPercent((d.aiVisitors / dayTotal) * 100, 0) : '0%'})
                                </span>
                              </span>
                            </div>
                          )}
                          {isChannelVisible('search') && (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: CHANNEL_COLORS.search }}
                                />
                                <span className="text-sm">{CHANNEL_LABELS.search}</span>
                              </div>
                              <span className="text-sm font-semibold">
                                {d.searchVisitors.toLocaleString()}
                                <span className="text-muted-foreground font-normal ml-1">
                                  ({dayTotal > 0 ? formatPercent((d.searchVisitors / dayTotal) * 100, 0) : '0%'})
                                </span>
                              </span>
                            </div>
                          )}
                          {isChannelVisible('direct') && (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: CHANNEL_COLORS.direct }}
                                />
                                <span className="text-sm">{CHANNEL_LABELS.direct}</span>
                              </div>
                              <span className="text-sm font-semibold">
                                {d.directVisitors.toLocaleString()}
                                <span className="text-muted-foreground font-normal ml-1">
                                  ({dayTotal > 0 ? formatPercent((d.directVisitors / dayTotal) * 100, 0) : '0%'})
                                </span>
                              </span>
                            </div>
                          )}
                          {isChannelVisible('other') && (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: CHANNEL_COLORS.other }}
                                />
                                <span className="text-sm">{CHANNEL_LABELS.other}</span>
                              </div>
                              <span className="text-sm font-semibold">
                                {d.otherVisitors.toLocaleString()}
                                <span className="text-muted-foreground font-normal ml-1">
                                  ({dayTotal > 0 ? formatPercent((d.otherVisitors / dayTotal) * 100, 0) : '0%'})
                                </span>
                              </span>
                            </div>
                          )}
                          <div className="border-t pt-1 mt-1">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm font-medium">Total</span>
                              <span className="text-sm font-semibold">
                                {dayTotal.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                }
                return null;
              }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              content={({ payload }) => (
                <div className="flex flex-wrap justify-center gap-4 mb-2">
                  {payload?.map((entry, _index) => {
                    if (isDetailedMode) {
                      // In detailed mode, show source name with actual favicons
                      const sourceInfo = detailedSources.find(s => s.sourceKey === entry.value);
                      const sourceKey = entry.value as string;

                      if (sourceInfo?.channel === 'ai') {
                        // AI sources: use AISourceIcon component
                        return (
                          <div key={sourceKey} className="flex items-center gap-1.5">
                            <AISourceIcon refSource={sourceKey} size={16} />
                            <span className="text-sm" style={{ color: entry.color }}>
                              {sourceKey}
                            </span>
                          </div>
                        );
                      } else if (sourceInfo?.channel === 'direct') {
                        // Direct: use MousePointer icon
                        return (
                          <div key={sourceKey} className="flex items-center gap-1.5">
                            <MousePointer className="h-4 w-4" style={{ color: entry.color }} />
                            <span className="text-sm" style={{ color: entry.color }}>
                              {sourceKey}
                            </span>
                          </div>
                        );
                      } else {
                        // Search/Other: use Google Favicon API with sourceKey as domain
                        return (
                          <div key={sourceKey} className="flex items-center gap-1.5">
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${sourceKey}&sz=32`}
                              alt={`${sourceKey} icon`}
                              className="w-4 h-4"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <span className="text-sm" style={{ color: entry.color }}>
                              {sourceKey}
                            </span>
                          </div>
                        );
                      }
                    } else {
                      // Channel mode: existing legend
                      const channelKey = Object.entries(CHANNEL_LABELS).find(
                        ([, label]) => label === entry.value
                      )?.[0] as keyof typeof CHANNEL_ICONS | undefined;
                      const Icon = channelKey ? CHANNEL_ICONS[channelKey] : null;
                      return (
                        <div key={entry.value} className="flex items-center gap-1.5">
                          {Icon && (
                            <Icon
                              className="h-4 w-4"
                              style={{ color: entry.color }}
                            />
                          )}
                          <span className="text-sm" style={{ color: entry.color }}>
                            {entry.value}
                          </span>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            />
            {isDetailedMode ? (
              // Detailed mode: render one Area per source
              detailedSources.map((source, index) => (
                <Area
                  key={source.sourceKey}
                  type="monotone"
                  dataKey={source.sourceKey}
                  stackId="1"
                  stroke={getSourceColor(source, index)}
                  fill={`url(#colorSource${index})`}
                  name={source.sourceKey}
                />
              ))
            ) : (
              // Channel mode: existing 4 areas
              <>
                {/* Stacked areas - order: Direct (bottom), Other, Search, AI (top) */}
                {isChannelVisible('direct') && (
                  <Area
                    type="monotone"
                    dataKey="directVisitors"
                    stackId="1"
                    stroke={CHANNEL_COLORS.direct}
                    fill="url(#colorDirectStacked)"
                    name={CHANNEL_LABELS.direct}
                  />
                )}
                {isChannelVisible('other') && (
                  <Area
                    type="monotone"
                    dataKey="otherVisitors"
                    stackId="1"
                    stroke={CHANNEL_COLORS.other}
                    fill="url(#colorOtherStacked)"
                    name={CHANNEL_LABELS.other}
                  />
                )}
                {isChannelVisible('search') && (
                  <Area
                    type="monotone"
                    dataKey="searchVisitors"
                    stackId="1"
                    stroke={CHANNEL_COLORS.search}
                    fill="url(#colorSearchStacked)"
                    name={CHANNEL_LABELS.search}
                  />
                )}
                {isChannelVisible('ai') && (
                  <Area
                    type="monotone"
                    dataKey="aiVisitors"
                    stackId="1"
                    stroke={CHANNEL_COLORS.ai}
                    fill="url(#colorAiStacked)"
                    name={CHANNEL_LABELS.ai}
                  />
                )}
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
