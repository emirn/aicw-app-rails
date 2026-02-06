/**
 * TrafficTab - Container for traffic-related analytics with subtabs
 *
 * Organizes Traffic Overview, Pages, and Bots into a single tabbed interface.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, FileText, Bug } from "lucide-react";
import { DateRange } from "react-day-picker";

import { AnalyticsStatsGrid } from "./AnalyticsStatsGrid";
import { GeoVisualization } from "./GeoVisualization";
import { StackedTrafficChart } from "./StackedTrafficChart";
import { TopPagesByChannelTable } from "./TopPagesByChannelTable";
import { TrafficSourceComparison } from "./TrafficSourceComparison";
import { CrawlerBreakdownTable } from "./CrawlerBreakdownTable";

import type { TrafficChannel } from "@/types/tinybird";

interface TrafficTabProps {
  // Analytics data
  analyticsData: {
    totalPageviews: number;
    aiPageviews: number;
    aiPercentage: number;
    topAiSource: string;
  } | null;
  analyticsLoading: boolean;
  trafficSourceData: any;
  trafficSourceLoading: boolean;
  trafficTrendData: any;
  trafficTrendLoading: boolean;
  trafficTrendBySourceData?: any;
  trafficTrendSources?: any;
  trafficTrendBySourceLoading?: boolean;
  aiSourcesData: any;
  searchSourcesData: any;
  otherSourcesData: any;
  geoData: any;
  geoLoading: boolean;
  topPagesByChannel: any;
  topPagesByChannelLoading: boolean;
  crawlerData: any;
  crawlerLoading: boolean;

  // Trends
  trends: any;
  periodLabel: string;
  aiTrends: any;
  searchTrends: any;
  otherTrends: any;
  countryTrends: any;
  pageTrends: any;

  // Filters & callbacks
  dateRange: DateRange | undefined;
  pageFilter: string | null;
  channelFilter: TrafficChannel[];
  countryFilter: string | null;
  onPageFilterChange: (path: string | null) => void;
  onChannelFilterChange: (channels: TrafficChannel[]) => void;
  onToggleChannel: (channel: TrafficChannel) => void;
  onCountryFilterChange: (country: string | null) => void;

  // Other
  showGettingStarted: boolean;
  onGettingStartedClick?: () => void;
  domain: string;
}

export function TrafficTab({
  analyticsData,
  analyticsLoading,
  trafficSourceData,
  trafficTrendData,
  trafficTrendLoading,
  trafficTrendBySourceData,
  trafficTrendSources,
  trafficTrendBySourceLoading,
  aiSourcesData,
  searchSourcesData,
  otherSourcesData,
  geoData,
  geoLoading,
  topPagesByChannel,
  topPagesByChannelLoading,
  crawlerData,
  crawlerLoading,
  trends,
  periodLabel,
  aiTrends,
  searchTrends,
  otherTrends,
  countryTrends,
  pageTrends,
  dateRange,
  pageFilter,
  channelFilter,
  countryFilter,
  onPageFilterChange,
  onChannelFilterChange,
  onToggleChannel,
  onCountryFilterChange,
  showGettingStarted,
  onGettingStartedClick,
  domain,
}: TrafficTabProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview" className="gap-1 sm:gap-2 px-2 sm:px-3">
          <TrendingUp className="w-4 h-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger value="pages" className="gap-1 sm:gap-2 px-2 sm:px-3">
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">Pages</span>
        </TabsTrigger>
        <TabsTrigger value="bots" className="gap-1 sm:gap-2 px-2 sm:px-3">
          <Bug className="w-4 h-4" />
          <span className="hidden sm:inline">Bots</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        {/* Analytics Stats Grid */}
        <AnalyticsStatsGrid
          stats={analyticsData || {
            totalPageviews: 0,
            aiPageviews: 0,
            aiPercentage: 0,
            topAiSource: "-",
          }}
          trafficSourceData={trafficSourceData}
          timeframe={dateRange ? "Selected period" : "All time"}
          trends={trends}
          periodLabel={periodLabel}
          channelFilter={channelFilter}
          onChannelFilterChange={onChannelFilterChange}
          onToggleChannel={onToggleChannel}
        />

        {/* Stacked Traffic Trend Chart */}
        <StackedTrafficChart
          data={trafficTrendData}
          detailedData={trafficTrendBySourceData}
          detailedSources={trafficTrendSources}
          detailedLoading={trafficTrendBySourceLoading}
          aiSourcesData={aiSourcesData}
          searchSourcesData={searchSourcesData}
          loading={trafficTrendLoading}
          channelFilter={channelFilter}
        />

        {/* Traffic Source Comparison with Detailed Breakdown */}
        <TrafficSourceComparison
          data={trafficSourceData}
          aiSourcesData={aiSourcesData}
          searchSourcesData={searchSourcesData}
          otherSourcesData={otherSourcesData}
          loading={false}
          categoryTrends={trends}
          aiTrends={aiTrends}
          searchTrends={searchTrends}
          otherTrends={otherTrends}
        />

        {/* Geographic Visualization */}
        <GeoVisualization
          data={geoData}
          loading={geoLoading}
          countryTrends={countryTrends}
          channelFilter={channelFilter.length > 0 ? channelFilter[0] : null}
          selectedCountry={countryFilter}
          onCountryClick={(country) => {
            // Toggle behavior: clicking same country clears the filter
            const isToggleOff = countryFilter === country;
            onCountryFilterChange(isToggleOff ? null : country);
          }}
        />

        {/* Getting Started Card - Show only if no data and showGettingStarted is true */}
        {showGettingStarted && !analyticsLoading && analyticsData?.totalPageviews === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Add the tracking script to your website to start collecting data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Install the tracking script on your website to begin tracking traffic.
                Add it before the closing &lt;/body&gt; tag.
              </p>
              {onGettingStartedClick && (
                <Button onClick={onGettingStartedClick}>
                  View Tracking Script
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="pages" className="space-y-6">
        {/* Top Pages by Channel Table */}
        <TopPagesByChannelTable
          data={topPagesByChannel}
          loading={topPagesByChannelLoading}
          selectedPagePath={pageFilter}
          pageTrends={pageTrends}
          channelFilter={channelFilter}
          onChannelFilterChange={onChannelFilterChange}
          onToggleChannel={onToggleChannel}
          trafficSourceData={trafficSourceData}
          domain={domain}
          onPageClick={(pagePath) => {
            // Toggle behavior: clicking same page clears the filter
            const isToggleOff = pageFilter === pagePath;
            onPageFilterChange(isToggleOff ? null : pagePath);
          }}
        />
      </TabsContent>

      <TabsContent value="bots" className="space-y-6">
        <CrawlerBreakdownTable
          data={crawlerData}
          loading={crawlerLoading}
        />
      </TabsContent>
    </Tabs>
  );
}
