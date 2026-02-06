import { useState, useEffect } from "react";
import type { TrafficChannel } from "@/types/tinybird";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TopPageByChannelData } from "@/hooks/use-top-pages-by-channel";
import { FileText, Bot, Search, MousePointer, Globe, ChevronUp, ChevronDown, Filter, Users } from "lucide-react";
import { TrendIndicator } from "./TrendIndicator";
import { ItemTrend } from "@/lib/trend-utils";
import { getSourceIconUrl, isValidVisitorSource } from "@/lib/ai-sources";
import { getPathLabel } from "@/lib/format";
import { TrafficSourceBreakdownData } from "@/hooks/use-traffic-source-breakdown";

interface TopPagesByChannelTableProps {
  data: TopPageByChannelData[];
  loading?: boolean;
  error?: Error | null;
  selectedPagePath?: string | null;
  onPageClick?: (pagePath: string) => void;
  pageTrends?: Map<string, ItemTrend>;
  channelFilter?: TrafficChannel[];  // Synced with URL params from parent
  onChannelFilterChange?: (channels: TrafficChannel[]) => void;  // Update URL params
  onToggleChannel?: (channel: TrafficChannel) => void;  // Toggle single channel (multi-select)
  trafficSourceData?: TrafficSourceBreakdownData[];  // Channel stats for filter buttons
  domain: string;  // Domain for constructing page URLs
}

// Channel colors
const CHANNEL_COLORS = {
  ai: "hsl(142, 76%, 36%)",
  search: "hsl(217, 91%, 60%)",
  direct: "hsl(240, 5%, 65%)",
  other: "hsl(25, 95%, 53%)",
};

// Channel config for filter buttons (icon and label)
const getChannelConfig = (category: string) => {
  switch (category.toLowerCase()) {
    case 'ai': return { Icon: Bot, label: 'AI Referrals' };
    case 'search': return { Icon: Search, label: 'Search' };
    case 'direct': return { Icon: MousePointer, label: 'Direct' };
    case 'other': return { Icon: Globe, label: 'Other' };
    default: return { Icon: Globe, label: category };
  }
};

type SortField = "total" | "ai" | "search" | "direct" | "other";
type SortDirection = "asc" | "desc";

// Get favicon URL for a domain
const getDomainFaviconUrl = (domain: string, size: number = 16): string => {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
};

// Reusable icon row component for sources
const SourceIconRow = ({ sources, isOther = false }: {
  sources: Array<{ name: string; displayName: string }>;
  isOther?: boolean;
}) => {
  if (sources.length === 0) return null;

  const getIconUrl = (sourceName: string): string => {
    if (!isOther) {
      // AI and Search sources - always use getSourceIconUrl
      return getSourceIconUrl(sourceName, false, 16);
    }
    // For "Other" sources:
    // - If it's a known source (e.g., "Reddit"), use getSourceIconUrl to look up domain
    // - If it's a raw domain (e.g., "example.com"), use getDomainFaviconUrl directly
    if (isValidVisitorSource(sourceName)) {
      return getSourceIconUrl(sourceName, false, 16);
    }
    return getDomainFaviconUrl(sourceName, 16);
  };

  return (
    <div className="flex items-center justify-center gap-0.5 mt-1">
      {sources.slice(0, 5).map((source) => (
        <Tooltip key={source.name}>
          <TooltipTrigger asChild>
            <div className="w-4 h-4 rounded-sm bg-white flex items-center justify-center cursor-help">
              <img
                src={getIconUrl(source.name)}
                alt={source.displayName}
                className="w-3 h-3 object-contain"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p className="font-medium">{source.displayName}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};

export function TopPagesByChannelTable({
  data,
  loading,
  error,
  selectedPagePath,
  onPageClick,
  pageTrends,
  channelFilter = [],  // Empty array means "all" (no filter)
  onChannelFilterChange,
  onToggleChannel,
  trafficSourceData = [],
  domain,
}: TopPagesByChannelTableProps) {
  const PAGE_SIZE = 12;
  const [sortField, setSortField] = useState<SortField>("total");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // Reset display count when data or filters change
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [data, channelFilter, sortField, sortDirection]);

  // Sort channels by visitors (descending) - most traffic first
  const sortedChannels = [...trafficSourceData].sort((a, b) => b.visitors - a.visitors);

  // Helper to get channel page stats for filter buttons
  const getChannelStats = (channel: TrafficChannel | 'all') => {
    if (channel === 'all') {
      const totalPages = trafficSourceData.reduce((sum, d) => sum + (d.unique_pages || 0), 0);
      return { pageCount: totalPages, percentage: 100 };
    }
    const channelData = trafficSourceData.find(
      d => d.source_category.toLowerCase() === channel
    );
    return {
      pageCount: channelData?.unique_pages ?? 0,
      percentage: channelData?.page_percentage ?? 0,
    };
  };

  // Format stats for display with muted styling (shows page count, not visitors)
  const formatChannelStats = (channel: TrafficChannel | 'all') => {
    const stats = getChannelStats(channel);
    if (stats.pageCount === 0 && channel !== 'all') return null;
    return (
      <span className="text-muted-foreground text-xs ml-1">
        {stats.pageCount} ({Math.round(stats.percentage)}%)
      </span>
    );
  };

  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Top Pages</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Page performance by traffic channel
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Top Pages</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load top pages data. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Top Pages</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
          <FileText className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground">
            No page data available for this time period.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Filter and sort data
  let filteredData = [...data];

  // Apply channel filter (show pages with traffic from selected channels)
  // Empty array means "all" (no filter)
  if (channelFilter.length > 0) {
    filteredData = filteredData.filter((page) => {
      // Page must have traffic from at least one of the selected channels
      return channelFilter.some((channel) => {
        switch (channel) {
          case "ai": return page.aiVisitors > 0;
          case "search": return page.searchVisitors > 0;
          case "direct": return page.directVisitors > 0;
          case "other": return page.otherVisitors > 0;
          default: return false;
        }
      });
    });
  }

  // Sort by selected field and direction
  filteredData.sort((a, b) => {
    let comparison: number;
    switch (sortField) {
      case "ai": comparison = a.aiVisitors - b.aiVisitors; break;
      case "search": comparison = a.searchVisitors - b.searchVisitors; break;
      case "direct": comparison = a.directVisitors - b.directVisitors; break;
      case "other": comparison = a.otherVisitors - b.otherVisitors; break;
      default: comparison = a.totalVisitors - b.totalVisitors;
    }
    return sortDirection === "desc" ? -comparison : comparison;
  });

  // Client-side pagination - show only first N items
  const displayedData = filteredData.slice(0, displayCount);
  const hasMore = filteredData.length > displayCount;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking same column
      setSortDirection(prev => prev === "desc" ? "asc" : "desc");
    } else {
      // New column: set field and default to descending
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Helper to render absolute value with percentage
  const renderPercentWithValue = (percent: number, absoluteValue: number) => {
    return (
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {absoluteValue} <span className="text-xs">({percent}%)</span>
      </span>
    );
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-primary" />
              <CardTitle>Top Pages</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Page performance by traffic channel • Click column headers to sort
            </p>
          </div>
        </div>
        {/* Channel filter buttons - synced with URL params, sorted by traffic */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {/* "All" button stays first */}
          <Button
            variant={channelFilter.length === 0 ? "default" : "outline"}
            size="sm"
            onClick={() => onChannelFilterChange?.([])}
            className="gap-1"
          >
            <Users className="w-3 h-3" />
            All{formatChannelStats('all')}
          </Button>
          {/* Dynamic channel buttons sorted by visitors */}
          {sortedChannels.map((channel) => {
            const key = channel.source_category.toLowerCase() as TrafficChannel;
            const config = getChannelConfig(key);
            const Icon = config.Icon;
            return (
              <Button
                key={key}
                variant={channelFilter.includes(key) ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleChannel?.(key)}
                className="gap-1"
              >
                <Icon className="w-3 h-3" />
                {config.label}{formatChannelStats(key)}
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border-2 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[50px] font-bold">#</TableHead>
                <TableHead className="font-bold">Page</TableHead>
                <TableHead
                  className="text-right font-bold cursor-pointer hover:bg-muted"
                  onClick={() => handleSort("total")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total
                    {sortField === "total" && (
                      sortDirection === "desc"
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead
                  className="text-center font-bold cursor-pointer hover:bg-muted"
                  onClick={() => handleSort("ai")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Bot className="w-3 h-3" style={{ color: CHANNEL_COLORS.ai }} />
                    AI %
                    {sortField === "ai" && (
                      sortDirection === "desc"
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead
                  className="text-center font-bold cursor-pointer hover:bg-muted"
                  onClick={() => handleSort("search")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Search className="w-3 h-3" style={{ color: CHANNEL_COLORS.search }} />
                    Search %
                    {sortField === "search" && (
                      sortDirection === "desc"
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead
                  className="text-center font-bold cursor-pointer hover:bg-muted"
                  onClick={() => handleSort("other")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Globe className="w-3 h-3" style={{ color: CHANNEL_COLORS.other }} />
                    Other %
                    {sortField === "other" && (
                      sortDirection === "desc"
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead
                  className="text-center font-bold cursor-pointer hover:bg-muted"
                  onClick={() => handleSort("direct")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <MousePointer className="w-3 h-3" style={{ color: CHANNEL_COLORS.direct }} />
                    Direct %
                    {sortField === "direct" && (
                      sortDirection === "desc"
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedData.map((page, index) => {
                const isSelected = selectedPagePath === page.pagePath;
                return (
                  <TableRow
                    key={`${page.pagePath}-${index}`}
                    className={`transition-colors hover:bg-accent/10 group ${isSelected ? "bg-primary/10 border-l-4 border-l-primary" : ""}`}
                  >
                    {/* Rank */}
                    <TableCell>
                      <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs bg-muted">
                        {index + 1}
                      </div>
                    </TableCell>

                    {/* Page Path */}
                    <TableCell className="font-mono text-sm max-w-[300px]">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://${domain}${page.pagePath}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium hover:underline hover:text-primary"
                          title={page.pageTitle || page.pagePath}
                        >
                          {page.pagePath || "/"}
                          {(() => {
                            const label = getPathLabel(page.pagePath);
                            return label && <span className="text-muted-foreground font-normal ml-1">({label})</span>;
                          })()}
                        </a>
                        {onPageClick && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPageClick(page.pagePath);
                                }}
                                className="p-1 rounded hover:bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto"
                              >
                                <Filter className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Filter by this page</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    {/* Total Visitors */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-semibold">
                          {page.totalVisitors.toLocaleString()}
                        </span>
                        {pageTrends?.get(page.pagePath) && (
                          <TrendIndicator
                            direction={pageTrends.get(page.pagePath)!.direction}
                            changePercent={pageTrends.get(page.pagePath)!.changePercent}
                            className="min-w-[50px]"
                          />
                        )}
                      </div>
                    </TableCell>

                    {/* AI Percentage with Top Sources Icons (vertical layout) */}
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        {renderPercentWithValue(page.aiPercent, page.aiVisitors)}
                        <TooltipProvider delayDuration={100}>
                          <SourceIconRow sources={page.topAiSources} />
                        </TooltipProvider>
                      </div>
                    </TableCell>

                    {/* Search Percentage with Top Sources Icons */}
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        {renderPercentWithValue(page.searchPercent, page.searchVisitors)}
                        <TooltipProvider delayDuration={100}>
                          <SourceIconRow sources={page.topSearchSources || []} />
                        </TooltipProvider>
                      </div>
                    </TableCell>

                    {/* Other Percentage with Top Referrer Icons */}
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        {renderPercentWithValue(page.otherPercent, page.otherVisitors)}
                        <TooltipProvider delayDuration={100}>
                          <SourceIconRow sources={page.topOtherSources || []} isOther />
                        </TooltipProvider>
                      </div>
                    </TableCell>

                    {/* Direct Percentage */}
                    <TableCell className="text-center">
                      {renderPercentWithValue(page.directPercent, page.directVisitors)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Show More Button */}
        {hasMore && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
            >
              Show More ({filteredData.length - displayCount} remaining)
            </Button>
          </div>
        )}

        {/* Summary Footer */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg border text-center">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground">{displayedData.length}</span> of{" "}
            <span className="font-bold text-foreground">{filteredData.length}</span> pages
            {channelFilter.length > 0 && (
              <> with <span className="font-bold">{channelFilter.join(", ")}</span> traffic</>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
