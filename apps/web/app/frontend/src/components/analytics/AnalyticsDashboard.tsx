import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, X, TrendingUp, Globe, Puzzle } from "lucide-react";
import { getCountryName } from "@/lib/countries";
import { getPathLabel } from "@/lib/format";
import { DateRange } from "react-day-picker";

import { DateRangePicker } from "./DateRangePicker";
import { TrafficTab } from "./TrafficTab";
import { WidgetTab } from "./WidgetTab";

// NOTE: Visibility, Rankings, and Todo tabs are not yet available in this port.
// The following imports are commented out until these features are ported:
// import { AIVisibilityHero } from "@/components/visibility/AIVisibilityHero";
// import { AIServicesGrid } from "@/components/visibility/AIServicesGrid";
// import { VisibilityReport } from "@/components/visibility/VisibilityReport";
// import { RankingsTab } from "@/components/rankings/RankingsTab";
// import { TodoTab } from "@/components/todos/TodoTab";
// import { useProjectVisibility } from "@/hooks/useVisibility";
// import { useTodosSummary } from "@/hooks/use-todos";

import { useAuthenticatedAnalytics } from "@/hooks/use-authenticated-analytics";
import { useAISourcesBreakdown } from "@/hooks/use-ai-sources-breakdown";
import { useSearchSourcesBreakdown } from "@/hooks/use-search-sources-breakdown";
import { useOtherSourcesBreakdown } from "@/hooks/use-other-sources-breakdown";
import { useVisitsGeo } from "@/hooks/use-visits-geo";
import { useTrafficTrendByChannel } from "@/hooks/use-traffic-trend-by-channel";
import { useTrafficTrendBySource } from "@/hooks/use-traffic-trend-by-source";
import { useTopPagesByChannel } from "@/hooks/use-top-pages-by-channel";
import { useTrafficSourceBreakdown } from "@/hooks/use-traffic-source-breakdown";
import { useCrawlerBreakdown } from "@/hooks/use-crawler-breakdown";
import { useTrendComparison } from "@/hooks/use-trend-comparison";
import { useSourceTrends } from "@/hooks/use-source-trends";
import { useGeoTrends } from "@/hooks/use-geo-trends";
import { usePagesTrends } from "@/hooks/use-pages-trends";
import { useSummarizeClicksOverview } from "@/hooks/use-summarize-clicks-overview";
import { useSummarizeClicksTimeseries } from "@/hooks/use-summarize-clicks-timeseries";
import { useSummarizeClicksByPage } from "@/hooks/use-summarize-clicks-by-page";
import { useShareClicksOverview } from "@/hooks/use-share-clicks-overview";
import { useShareClicksTimeseries } from "@/hooks/use-share-clicks-timeseries";
import { useShareClicksByPage } from "@/hooks/use-share-clicks-by-page";
import type { TrafficChannel } from "@/types/tinybird";
// Widget config type (simplified — full generate-tracking-script not yet ported)
type WidgetConfigType = Record<string, any>;

interface AnalyticsDashboardProps {
  projectId: string;
  projectName: string;
  domain: string;
  isPublic: boolean;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  pageFilter: string | null;
  onPageFilterChange: (path: string | null) => void;
  channelFilter: TrafficChannel[];
  onChannelFilterChange: (channels: TrafficChannel[]) => void;
  onToggleChannel: (channel: TrafficChannel) => void;
  countryFilter: string | null;
  onCountryFilterChange: (country: string | null) => void;
  onClearAllFilters: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  showSettingsTab?: boolean;
  settingsContent?: React.ReactNode;
  onSettingsClick?: () => void;
  showGettingStarted?: boolean;
  onGettingStartedClick?: () => void;
  // Widget configuration props (optional - passed through to WidgetTab)
  widgetConfig?: WidgetConfigType;
  onWidgetConfigChange?: (config: WidgetConfigType) => void;
  trackingId?: string;
  projectDomain?: string;
  trackingScript?: string;
}

export function AnalyticsDashboard({
  projectId,
  projectName: _projectName,
  domain,
  isPublic,
  dateRange,
  onDateRangeChange,
  pageFilter,
  onPageFilterChange,
  channelFilter,
  onChannelFilterChange,
  onToggleChannel,
  countryFilter,
  onCountryFilterChange,
  onClearAllFilters,
  activeTab,
  onTabChange,
  showSettingsTab = false,
  settingsContent,
  onSettingsClick,
  showGettingStarted = false,
  onGettingStartedClick,
  widgetConfig,
  onWidgetConfigChange,
  trackingId,
  projectDomain,
  trackingScript,
}: AnalyticsDashboardProps) {
  // Fetch analytics data - pass isPublic to all hooks
  const { data: analyticsData, loading: analyticsLoading } = useAuthenticatedAnalytics(
    projectId,
    undefined, // projectName - not needed for data fetching
    domain,
    dateRange?.from,
    dateRange?.to,
    pageFilter,
    channelFilter,
    countryFilter,
    isPublic
  );

  // Fetch AI sources breakdown
  const { data: aiSourcesData, loading: _aiSourcesLoading } = useAISourcesBreakdown(
    projectId,
    dateRange?.from,
    dateRange?.to,
    pageFilter,
    countryFilter,
    isPublic
  );

  // Fetch search sources breakdown
  const { data: searchSourcesData, loading: _searchSourcesLoading } = useSearchSourcesBreakdown(
    projectId,
    dateRange?.from,
    dateRange?.to,
    pageFilter,
    countryFilter,
    isPublic
  );

  // Fetch other sources breakdown
  const { data: otherSourcesData, loading: _otherSourcesLoading } = useOtherSourcesBreakdown(
    projectId,
    dateRange?.from,
    dateRange?.to,
    13,
    pageFilter,
    countryFilter,
    isPublic
  );

  // Fetch geographic data
  const { data: geoData, loading: geoLoading } = useVisitsGeo(
    projectId,
    dateRange?.from,
    dateRange?.to,
    channelFilter,
    undefined, // refSourceFilter
    pageFilter,
    countryFilter,
    isPublic
  );

  // Fetch traffic trend by channel
  const { data: trafficTrendData, loading: trafficTrendLoading } = useTrafficTrendByChannel(
    projectId,
    dateRange?.from,
    dateRange?.to,
    "day",
    pageFilter,
    channelFilter,
    countryFilter,
    isPublic
  );

  // Fetch traffic trend by source (for detailed breakdown - top 12 sources)
  const {
    data: trafficTrendBySourceData,
    sources: trafficTrendSources,
    loading: trafficTrendBySourceLoading,
  } = useTrafficTrendBySource(
    projectId,
    dateRange?.from,
    dateRange?.to,
    "day",
    pageFilter,
    countryFilter,
    12, // top 12 sources
    isPublic
  );

  // Fetch top pages by channel - don't pass pageFilter here
  const { data: topPagesByChannel, loading: topPagesByChannelLoading } = useTopPagesByChannel(
    projectId,
    dateRange?.from,
    dateRange?.to,
    100, // Fetch more for client-side pagination
    null, // pageFilter
    channelFilter,
    countryFilter,
    isPublic
  );

  // Fetch traffic source breakdown
  const { data: trafficSourceData, loading: trafficSourceLoading } = useTrafficSourceBreakdown(
    projectId,
    dateRange?.from,
    dateRange?.to,
    pageFilter,
    countryFilter,
    isPublic
  );

  // Fetch trend comparison (compares current period to previous equivalent period)
  const { trends, periodLabel } = useTrendComparison(
    projectId,
    dateRange,
    trafficSourceData,
    isPublic
  );

  // Fetch source trends for detailed breakdown (AI, Search, Other sources)
  const { aiTrends, searchTrends, otherTrends } = useSourceTrends(
    projectId,
    dateRange,
    aiSourcesData,
    searchSourcesData,
    otherSourcesData,
    isPublic
  );

  // Fetch geo trends for countries
  const { countryTrends } = useGeoTrends(
    projectId,
    dateRange,
    geoData,
    channelFilter,
    isPublic
  );

  // Fetch pages trends
  const { pageTrends } = usePagesTrends(
    projectId,
    dateRange,
    topPagesByChannel,
    isPublic
  );

  // NOTE: Visibility check hook removed - not yet available in this port
  // const { data: visibilityCheck, isLoading: visibilityLoading } = useProjectVisibility(projectId, isPublic);

  // Fetch crawler/bot breakdown
  const { data: crawlerData, loading: crawlerLoading } = useCrawlerBreakdown(
    projectId,
    dateRange?.from,
    dateRange?.to,
    pageFilter,
    countryFilter,
    isPublic
  );

  // NOTE: Todos summary hook removed - not yet available in this port
  // const { data: todoSummary } = useTodosSummary(projectId);

  // Fetch summarize clicks data (Ask AI Clicks tab)
  const {
    data: summarizeOverviewData,
    totalClicks: summarizeTotalClicks,
    totalSessions: summarizeTotalSessions,
    totalOpens: summarizeTotalOpens,
    clickThroughRate: summarizeClickThroughRate,
    loading: summarizeOverviewLoading,
  } = useSummarizeClicksOverview(
    projectId,
    dateRange?.from,
    dateRange?.to,
    isPublic
  );

  const { data: summarizeTrendData, loading: summarizeTrendLoading } = useSummarizeClicksTimeseries(
    projectId,
    dateRange?.from,
    dateRange?.to,
    "day",
    isPublic
  );

  const { aggregatedData: summarizeByPageData, loading: summarizeByPageLoading } = useSummarizeClicksByPage(
    projectId,
    dateRange?.from,
    dateRange?.to,
    50,
    isPublic
  );

  // Share Clicks data
  const {
    data: shareOverviewData,
    totalClicks: shareTotalClicks,
    totalSessions: shareTotalSessions,
    loading: shareOverviewLoading,
  } = useShareClicksOverview(
    projectId,
    dateRange?.from,
    dateRange?.to,
    isPublic
  );

  const { data: shareTrendData, loading: shareTrendLoading } = useShareClicksTimeseries(
    projectId,
    dateRange?.from,
    dateRange?.to,
    "day",
    isPublic
  );

  const { aggregatedData: shareByPageData, loading: shareByPageLoading } = useShareClicksByPage(
    projectId,
    dateRange?.from,
    dateRange?.to,
    50,
    isPublic
  );

  // Get channel display name
  const getChannelDisplayName = (channel: TrafficChannel): string => {
    const names: Record<TrafficChannel, string> = {
      ai: "AI Referrals",
      search: "Search",
      direct: "Direct",
      other: "Other",
    };
    return names[channel];
  };

  // Compute page label for filter badge (moved out of JSX for readability)
  const pageLabel = pageFilter ? getPathLabel(pageFilter) : null;

  return (
    <>
      {/* Filter Badges */}
      {(pageFilter || channelFilter.length > 0 || countryFilter) && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Reset Filters Link - RED */}
          <button
            onClick={onClearAllFilters}
            className="text-xs sm:text-sm text-destructive hover:underline font-medium"
          >
            Reset Filters
          </button>
          <span className="text-muted-foreground hidden sm:inline">|</span>
          {channelFilter.length > 0 && (
            <>
              <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">Channels:</span>
              <Badge variant="secondary" className="gap-1 px-2 sm:px-3 py-1">
                <span className="text-xs truncate max-w-[120px] sm:max-w-none">
                  {channelFilter.map(c => getChannelDisplayName(c)).join(", ")}
                </span>
                <button
                  onClick={() => onChannelFilterChange([])}
                  className="ml-1 hover:bg-muted rounded-full p-0.5 flex-shrink-0"
                  aria-label="Clear channel filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </>
          )}
          {pageFilter && (
            <>
              <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">Page:</span>
              <Badge variant="secondary" className="gap-1 px-2 sm:px-3 py-1 max-w-full">
                <FileText className="h-3 w-3 flex-shrink-0" />
                <span className="font-mono text-xs max-w-[150px] sm:max-w-[300px] truncate">
                  {pageFilter}
                  {pageLabel && <span className="text-muted-foreground font-normal ml-1 hidden sm:inline">({pageLabel})</span>}
                </span>
                <button
                  onClick={() => onPageFilterChange(null)}
                  className="ml-1 hover:bg-muted rounded-full p-0.5 flex-shrink-0"
                  aria-label="Clear page filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </>
          )}
          {countryFilter && (
            <>
              <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">Country:</span>
              <Badge variant="secondary" className="gap-1 px-2 sm:px-3 py-1">
                <Globe className="h-3 w-3 flex-shrink-0" />
                <span className="text-xs">{getCountryName(countryFilter)}</span>
                <button
                  onClick={() => onCountryFilterChange(null)}
                  className="ml-1 hover:bg-muted rounded-full p-0.5 flex-shrink-0"
                  aria-label="Clear country filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-6">
        <div className="flex flex-col gap-4">
          {/* Tabs row - scrollable on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {/* Scrollable tabs container for mobile with fade indicator */}
              <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide scroll-fade-right sm:scroll-fade-none">
                <TabsList className="inline-flex w-max">
                  <TabsTrigger value="traffic" className="text-sm sm:text-base px-2 sm:px-3">
                    <TrendingUp className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Traffic</span>
                  </TabsTrigger>
                  {/* NOTE: Visibility, Rankings, and Todo tabs are not yet available in this port.
                  <TabsTrigger value="ai-visibility" className="text-sm sm:text-base px-2 sm:px-3">
                    <Search className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Visibility</span>
                  </TabsTrigger>
                  <TabsTrigger value="rankings" className="text-sm sm:text-base px-2 sm:px-3">
                    <Trophy className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Rankings</span>
                  </TabsTrigger>
                  */}
                  <TabsTrigger value="widget" className="text-sm sm:text-base px-2 sm:px-3">
                    <Puzzle className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Widget</span>
                  </TabsTrigger>
                  {/* NOTE: Todo tab not yet available in this port.
                  <TabsTrigger value="todo" className="text-sm sm:text-base px-2 sm:px-3">
                    <ListTodo className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">To-do</span>
                    {todoSummary && (todoSummary.pending + todoSummary.in_progress) > 0 && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                        {todoSummary.pending + todoSummary.in_progress}
                      </span>
                    )}
                  </TabsTrigger>
                  */}
                </TabsList>
              </div>
              {showSettingsTab && onSettingsClick && (
                <button
                  onClick={onSettingsClick}
                  className="text-blue-600 hover:text-blue-800 hover:underline text-sm whitespace-nowrap hidden sm:block"
                >
                  project settings
                </button>
              )}
            </div>
            <DateRangePicker
              value={dateRange}
              onChange={onDateRangeChange}
              className="flex-shrink-0"
              isPublic={isPublic}
            />
          </div>
          {/* Mobile-only settings link */}
          {showSettingsTab && onSettingsClick && (
            <button
              onClick={onSettingsClick}
              className="text-blue-600 hover:text-blue-800 hover:underline text-sm sm:hidden text-left"
            >
              project settings
            </button>
          )}
        </div>

        {/* NOTE: Todo tab content removed - not yet available in this port.
        <TabsContent value="todo" className="space-y-6">
          <TodoTab projectId={projectId} isPublic={isPublic} />
        </TabsContent>
        */}

        <TabsContent value="traffic" className="space-y-6">
          <TrafficTab
            analyticsData={analyticsData}
            analyticsLoading={analyticsLoading}
            trafficSourceData={trafficSourceData}
            trafficSourceLoading={trafficSourceLoading}
            trafficTrendData={trafficTrendData}
            trafficTrendLoading={trafficTrendLoading}
            trafficTrendBySourceData={trafficTrendBySourceData}
            trafficTrendSources={trafficTrendSources}
            trafficTrendBySourceLoading={trafficTrendBySourceLoading}
            aiSourcesData={aiSourcesData}
            searchSourcesData={searchSourcesData}
            otherSourcesData={otherSourcesData}
            geoData={geoData}
            geoLoading={geoLoading}
            topPagesByChannel={topPagesByChannel}
            topPagesByChannelLoading={topPagesByChannelLoading}
            crawlerData={crawlerData}
            crawlerLoading={crawlerLoading}
            trends={trends}
            periodLabel={periodLabel}
            aiTrends={aiTrends}
            searchTrends={searchTrends}
            otherTrends={otherTrends}
            countryTrends={countryTrends}
            pageTrends={pageTrends}
            dateRange={dateRange}
            pageFilter={pageFilter}
            channelFilter={channelFilter}
            countryFilter={countryFilter}
            onPageFilterChange={onPageFilterChange}
            onChannelFilterChange={onChannelFilterChange}
            onToggleChannel={onToggleChannel}
            onCountryFilterChange={onCountryFilterChange}
            showGettingStarted={showGettingStarted}
            onGettingStartedClick={onGettingStartedClick}
            domain={domain}
          />
        </TabsContent>

        {/* NOTE: AI Visibility tab content removed - not yet available in this port.
        <TabsContent value="ai-visibility" className="space-y-6">
          ...visibility content...
        </TabsContent>
        */}

        {/* NOTE: Rankings tab content removed - not yet available in this port.
        <TabsContent value="rankings" className="space-y-6">
          <RankingsTab
            projectId={projectId}
            projectName={projectName}
            domain={domain}
            isPublic={isPublic}
          />
        </TabsContent>
        */}

        <TabsContent value="widget" className="space-y-6">
          <WidgetTab
            summarizeOverviewData={summarizeOverviewData}
            summarizeTrendData={summarizeTrendData}
            summarizeByPageData={summarizeByPageData}
            summarizeTotalClicks={summarizeTotalClicks}
            summarizeTotalSessions={summarizeTotalSessions}
            summarizeTotalOpens={summarizeTotalOpens}
            summarizeClickThroughRate={summarizeClickThroughRate}
            summarizeOverviewLoading={summarizeOverviewLoading}
            summarizeTrendLoading={summarizeTrendLoading}
            summarizeByPageLoading={summarizeByPageLoading}
            shareOverviewData={shareOverviewData}
            shareTrendData={shareTrendData}
            shareByPageData={shareByPageData}
            shareTotalClicks={shareTotalClicks}
            shareTotalSessions={shareTotalSessions}
            shareOverviewLoading={shareOverviewLoading}
            shareTrendLoading={shareTrendLoading}
            shareByPageLoading={shareByPageLoading}
            dateRange={dateRange}
            onPageClick={(pagePath) => {
              onPageFilterChange(pagePath);
              onTabChange("traffic");
            }}
            widgetConfig={widgetConfig}
            onWidgetConfigChange={onWidgetConfigChange}
            trackingId={trackingId}
            projectDomain={projectDomain}
            trackingScript={trackingScript}
            domain={domain}
          />
        </TabsContent>

        {showSettingsTab && settingsContent && (
          <TabsContent value="settings" className="space-y-6">
            {settingsContent}
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
