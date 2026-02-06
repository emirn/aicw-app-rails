import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Bot, Search, MousePointer, Globe, Filter } from "lucide-react";
import { TrafficSourceBreakdownData } from "@/hooks/use-traffic-source-breakdown";
import { TrendIndicator } from "./TrendIndicator";
import { ChannelTrend, getTrendForCategory } from "@/lib/trend-utils";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TrafficChannel } from "@/types/tinybird";

export interface AnalyticsStats {
  totalPageviews: number;
  totalVisitors?: number; // Add optional totalVisitors field
  aiPageviews: number;
  aiPercentage: number;
  topAiSource: string;
  topAiSourceId?: string | null;
}

interface AnalyticsStatsGridProps {
  stats: AnalyticsStats;
  trafficSourceData?: TrafficSourceBreakdownData[];
  timeframe?: string;
  trends?: ChannelTrend[];
  periodLabel?: string;
  channelFilter?: TrafficChannel[];
  onChannelFilterChange?: (channels: TrafficChannel[]) => void;
  onToggleChannel?: (channel: TrafficChannel) => void;
}

// Helper function to get icon, color, and label for each category
const getCategoryConfig = (category: string) => {
  switch (category.toLowerCase()) {
    case 'ai':
      return {
        Icon: Bot,
        color: 'text-success',
        borderColor: 'border-l-success',
        label: 'AI Referrals',
      };
    case 'search':
      return {
        Icon: Search,
        color: 'text-blue-600',
        borderColor: 'border-l-blue-600',
        label: 'Search',
      };
    case 'direct':
      return {
        Icon: MousePointer,
        color: 'text-gray-600',
        borderColor: 'border-l-gray-600',
        label: 'Direct',
      };
    case 'other':
      return {
        Icon: Globe,
        color: 'text-orange-600',
        borderColor: 'border-l-orange-600',
        label: 'Other',
      };
    default:
      return {
        Icon: Globe,
        color: 'text-muted-foreground',
        borderColor: 'border-l-muted',
        label: category,
      };
  }
};

/**
 * Analytics stats grid component
 * Displays Total Visitors first, then all 4 traffic channels (AI, Search, Direct, Other)
 * Provides an overview of where visitors come from
 */
export function AnalyticsStatsGrid({
  stats,
  trafficSourceData = [],
  timeframe = "All time",
  trends,
  periodLabel,
  channelFilter = [],
  onChannelFilterChange,
  onToggleChannel,
}: AnalyticsStatsGridProps) {
  // Sort channels by visitors (descending) - most traffic first
  const allChannels = [...trafficSourceData]
    .sort((a, b) => b.visitors - a.visitors);

  // Calculate total from traffic sources as fallback when analytics_overview returns 0
  const trafficSourceTotal = trafficSourceData.reduce((sum, d) => sum + d.visitors, 0);
  const totalVisitorCount = stats.totalVisitors || trafficSourceTotal || stats.totalPageviews;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {/* Total Visitors - Primary metric (LEFT) - Clickable to reset channel filter */}
      <Card
        onClick={() => onChannelFilterChange?.([])}
        className={cn(
          "border-l-4 border-l-primary transition-all",
          onChannelFilterChange && "cursor-pointer hover:shadow-md",
          channelFilter.length === 0 && onChannelFilterChange && "ring-2 ring-primary shadow-md bg-primary/5"
        )}
      >
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Users className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">All</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">
            {totalVisitorCount.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">{timeframe}</p>
          {(() => {
            const totalTrend = getTrendForCategory(trends, 'total');
            return totalTrend ? (
              <TrendIndicator
                direction={totalTrend.direction}
                changePercent={totalTrend.changePercent}
                periodLabel={periodLabel}
              />
            ) : null;
          })()}
        </CardContent>
      </Card>

      {/* All 4 Channels - Ordered: AI, Search, Other, Direct */}
      {allChannels.map((channel) => {
        const config = getCategoryConfig(channel.source_category);
        const Icon = config.Icon;
        const channelKey = channel.source_category.toLowerCase() as TrafficChannel;
        const isActive = channelFilter.includes(channelKey);
        const channelTrend = getTrendForCategory(
          trends,
          channelKey as ChannelTrend['category']
        );

        const handleClick = () => {
          // Use toggleChannel for multi-select behavior
          onToggleChannel?.(channelKey);
        };

        return (
          <Card
            key={channel.source_category}
            onClick={handleClick}
            className={cn(
              "border-l-4 transition-all",
              config.borderColor,
              onChannelFilterChange && "cursor-pointer hover:shadow-md",
              isActive && "ring-2 ring-primary shadow-md bg-primary/5"
            )}
          >
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <Icon className={`h-4 w-4 ${config.color}`} />
              <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
              {onChannelFilterChange && (
                <Filter
                  className={cn(
                    "h-3 w-3 transition-opacity ml-auto",
                    isActive ? "opacity-100 text-primary" : "opacity-0"
                  )}
                />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${config.color}`}>
                {channel.visitors.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatPercent(channel.percentage)} of total
              </p>
              {channelTrend && (
                <TrendIndicator
                  direction={channelTrend.direction}
                  changePercent={channelTrend.changePercent}
                />
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Fill empty slots if less than 4 channels with placeholder cards */}
      {[...Array(Math.max(0, 4 - allChannels.length))].map((_, i) => (
        <Card key={`empty-${i}`} className="opacity-40 border-dashed">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              -
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">-</div>
            <p className="text-xs text-muted-foreground">No data</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
