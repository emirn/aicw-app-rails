import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TrafficSourceBreakdownData } from "@/hooks/use-traffic-source-breakdown";
import { AISourceBreakdown } from "@/hooks/use-ai-sources-breakdown";
import { SearchSourceBreakdown } from "@/hooks/use-search-sources-breakdown";
import { OtherSourceBreakdown } from "@/hooks/use-other-sources-breakdown";
import { TrendingUp, Search, MousePointer, Globe, Bot } from "lucide-react";
import { AISourceIcon } from "./AISourceIcon";
import { TrendIndicator } from "./TrendIndicator";
import { ChannelTrend, ItemTrend } from "@/lib/trend-utils";
import { formatPercent } from "@/lib/format";

interface TrafficSourceComparisonProps {
  data: TrafficSourceBreakdownData[];
  aiSourcesData?: AISourceBreakdown[]; // Detailed AI sources for breakdown
  searchSourcesData?: SearchSourceBreakdown[]; // Detailed search sources for breakdown
  otherSourcesData?: OtherSourceBreakdown[]; // Detailed other referrer sources for breakdown
  loading?: boolean;
  error?: Error | null;
  // Trend data
  categoryTrends?: ChannelTrend[];
  aiTrends?: Map<string, ItemTrend>;
  searchTrends?: Map<string, ItemTrend>;
  otherTrends?: Map<string, ItemTrend>;
}

// Category colors and icons
const CATEGORY_STYLES: Record<string, { color: string; icon: any; label: string }> = {
  ai: {
    color: "hsl(142, 76%, 36%)",
    icon: Bot,
    label: "AI Referrals"
  },
  search: {
    color: "hsl(217, 91%, 60%)",
    icon: Search,
    label: "Search Engines"
  },
  direct: {
    color: "hsl(240, 5%, 65%)",
    icon: MousePointer,
    label: "Direct Traffic"
  },
  other: {
    color: "hsl(25, 95%, 53%)",
    icon: Globe,
    label: "Other Sources"
  },
};

export function TrafficSourceComparison({
  data,
  aiSourcesData = [],
  searchSourcesData = [],
  otherSourcesData = [],
  loading,
  error,
  categoryTrends,
  aiTrends,
  searchTrends,
  otherTrends,
}: TrafficSourceComparisonProps) {
  const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);

  // Helper to get trend for an item
  const getTrendForItem = (category: string, refSource?: string): ItemTrend | ChannelTrend | undefined => {
    if (!showDetailedBreakdown || !refSource) {
      // Category-level trend
      return categoryTrends?.find(t => t.category === category);
    }
    // Source-level trend
    if (category === 'ai') return aiTrends?.get(refSource);
    if (category === 'search') return searchTrends?.get(refSource);
    if (category === 'other') return otherTrends?.get(refSource);
    return undefined;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Traffic Source Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] sm:h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Traffic Source Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load traffic source data. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Traffic Source Comparison</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[220px] sm:h-[300px] text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            No traffic data available for this period.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate total visits
  const totalVisits = data.reduce((sum, item) => sum + Number(item.pageviews), 0);

  // Calculate total visitors for percentage calculations
  const totalVisitors = data.reduce((sum, item) => sum + Number(item.visitors || 0), 0);

  // Build chart data based on detailed breakdown toggle
  const chartData: Array<{
    label: string;
    visits: number;
    visitors: number;
    percentage: number;
    category: string;
    color: string;
    icon?: any;
    refSource?: string;
    domain?: string; // For favicon lookup
    isBucket?: boolean;
  }> = [];

  if (showDetailedBreakdown && (aiSourcesData.length > 0 || searchSourcesData.length > 0 || otherSourcesData.length > 0)) {
    // Detailed mode: Flat list of all individual sources sorted by visitors

    // 1. Add all individual AI sources
    aiSourcesData.forEach((aiSource) => {
      chartData.push({
        label: aiSource.display_name,
        visits: aiSource.pageviews,
        visitors: aiSource.visitors,
        percentage: totalVisitors > 0 ? (aiSource.visitors / totalVisitors) * 100 : 0,
        category: 'ai',
        color: CATEGORY_STYLES.ai.color,
        refSource: aiSource.refSource,
      });
    });

    // 2. Add all individual Search sources
    searchSourcesData.forEach((searchSource) => {
      chartData.push({
        label: searchSource.display_name,
        visits: searchSource.pageviews,
        visitors: searchSource.visitors,
        percentage: totalVisitors > 0 ? (searchSource.visitors / totalVisitors) * 100 : 0,
        category: 'search',
        color: CATEGORY_STYLES.search.color,
        icon: Search,
        domain: searchSource.refSource, // Use for favicon
      });
    });

    // 3. Add Direct traffic as single entry
    const directData = data.find(d => d.source_category === 'direct');
    if (directData) {
      chartData.push({
        label: CATEGORY_STYLES.direct.label,
        visits: Number(directData.pageviews),
        visitors: Number(directData.visitors),
        percentage: Number(directData.percentage),
        category: 'direct',
        color: CATEGORY_STYLES.direct.color,
        icon: CATEGORY_STYLES.direct.icon,
      });
    }

    // 4. Add top 12 "Other" sources individually
    const top12Other = otherSourcesData.slice(0, 12);
    top12Other.forEach((otherSource) => {
      chartData.push({
        label: otherSource.display_name,
        visits: otherSource.pageviews,
        visitors: otherSource.visitors,
        percentage: totalVisitors > 0 ? (otherSource.visitors / totalVisitors) * 100 : 0,
        category: 'other',
        color: CATEGORY_STYLES.other.color,
        icon: Globe,
        domain: otherSource.refSource, // Use for favicon
      });
    });

    // 5. Calculate "Other referrers" bucket for remaining traffic
    const otherCategoryTotal = data.find(d => d.source_category === 'other');
    const individualOtherTotal = top12Other.reduce((sum, s) => sum + s.visitors, 0);
    const remainingOther = (Number(otherCategoryTotal?.visitors) || 0) - individualOtherTotal;

    if (remainingOther > 0) {
      chartData.push({
        label: 'Other referrers',
        visits: 0, // We don't have pageview data for the bucket
        visitors: remainingOther,
        percentage: totalVisitors > 0 ? (remainingOther / totalVisitors) * 100 : 0,
        category: 'other',
        color: CATEGORY_STYLES.other.color,
        icon: Globe,
        isBucket: true,
      });
    }
  } else {
    // Simple mode: Show aggregated categories
    data.forEach((item) => {
      const category = item.source_category;
      const style = CATEGORY_STYLES[category];

      chartData.push({
        label: style.label,
        visits: Number(item.pageviews),
        visitors: Number(item.visitors),
        percentage: Number(item.percentage),
        category,
        color: style.color,
        icon: style.icon,
      });
    });
  }

  // Sort by visitors descending
  chartData.sort((a, b) => b.visitors - a.visitors);

  // Find max percentage for bar scaling
  const maxPercentage = Math.max(...chartData.map(d => d.percentage));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Traffic Source Comparison</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              How AI traffic compares to other sources
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="detailed-breakdown"
                checked={showDetailedBreakdown}
                onCheckedChange={(checked) => setShowDetailedBreakdown(checked === true)}
              />
              <Label
                htmlFor="detailed-breakdown"
                className="text-sm font-normal cursor-pointer"
              >
                Detailed Breakdown
              </Label>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Visits</p>
              <p className="text-sm font-semibold">{totalVisits.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {chartData.map((item, index) => {
            const Icon = item.icon;

            return (
              <div key={`${item.category}-${item.label}-${index}`} className="space-y-1.5">
                {/* Label and Stats Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-[180px]">
                    {item.refSource ? (
                      // AI sources use AISourceIcon
                      <AISourceIcon refSource={item.refSource} size={18} showLabel />
                    ) : item.domain ? (
                      // Search/Other sources with domain use Google Favicon
                      <>
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`}
                          alt={`${item.label} icon`}
                          className="w-4 h-4 rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <span className="text-sm font-medium">{item.label}</span>
                      </>
                    ) : (
                      // Fallback to icon + label
                      <>
                        {Icon && <Icon className="w-4 h-4" style={{ color: item.color }} />}
                        <span className="text-sm font-medium">{item.label}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground min-w-[70px] text-right">
                      {item.visitors.toLocaleString()} visitors
                    </span>
                    {(() => {
                      const trend = getTrendForItem(item.category, item.refSource);
                      return trend ? (
                        <TrendIndicator
                          direction={trend.direction}
                          changePercent={trend.changePercent}
                          className="min-w-[60px]"
                        />
                      ) : null;
                    })()}
                    <span className="text-sm text-muted-foreground min-w-[50px] text-right">
                      {formatPercent(item.percentage)}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="relative w-full h-7 bg-muted rounded-md overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all duration-500 ease-out"
                    style={{
                      width: `${(item.percentage / maxPercentage) * 100}%`,
                      backgroundColor: item.color,
                      opacity: 0.8,
                    }}
                  />
                  {/* Inner label for wide bars */}
                  {item.percentage > 15 && (
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-xs font-medium text-white drop-shadow">
                        {formatPercent(item.percentage)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {showDetailedBreakdown && (aiSourcesData.length > 0 || searchSourcesData.length > 0 || otherSourcesData.length > 0) && (
          <div className="mt-6 p-3 bg-muted/50 rounded-lg border">
            <p className="text-xs text-muted-foreground">
              Showing {chartData.length} traffic sources
              {aiSourcesData.length > 0 && ` • ${aiSourcesData.length} AI platforms`}
              {searchSourcesData.length > 0 && ` • ${searchSourcesData.length} search engines`}
              {otherSourcesData.length > 0 && ` • ${Math.min(otherSourcesData.length, 12)} other referrers`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
