import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { usePublicProject } from "@/hooks/use-public-project";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { Loader2 } from "lucide-react";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { PublicAnalyticsHeader } from "@/components/PublicAnalyticsHeader";
import { PublicAnalyticsFooter } from "@/components/PublicAnalyticsFooter";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { DateRange } from "react-day-picker";
import { subDays } from "date-fns";

const PublicAnalytics = () => {
  const { domain } = useParams<{ domain: string }>();
  const { projectId, projectName, isPublicEnabled, loading, error: _error } = usePublicProject(domain);

  // Date range state (default: Last 7 days)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  });

  // URL-synced filters (page, channel, country)
  const { channelFilter, pageFilter, countryFilter, setChannelFilter, toggleChannel, setPageFilter, setCountryFilter, clearAllFilters } = useUrlFilters();

  // Active tab state
  const [activeTab, setActiveTab] = useState("traffic");

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Public page disabled or project not found
  if (!isPublicEnabled || !projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Analytics Not Available</CardTitle>
            <CardDescription>
              {domain
                ? `Public analytics for "${domain}" are not available or have been disabled.`
                : "Invalid domain specified."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link to="/">
              <Button>Go to Homepage</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main public analytics display with full dashboard
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Narrow Header Bar */}
      <PublicAnalyticsHeader projectName={projectName || domain || "Analytics"} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 sm:py-8 flex-1">
        {/* Project Title */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold truncate">
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {projectName}
            </a>
          </h1>
        </div>

        {/* Full Analytics Dashboard */}
        <AnalyticsDashboard
          projectId={projectId}
          projectName={projectName || domain || ""}
          domain={domain || ""}
          isPublic={true}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          pageFilter={pageFilter}
          onPageFilterChange={setPageFilter}
          channelFilter={channelFilter}
          onChannelFilterChange={setChannelFilter}
          onToggleChannel={toggleChannel}
          countryFilter={countryFilter}
          onCountryFilterChange={setCountryFilter}
          onClearAllFilters={clearAllFilters}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showSettingsTab={false}
          showGettingStarted={false}
        />
      </main>

      {/* Narrow Footer Bar */}
      <PublicAnalyticsFooter />
    </div>
  );
};

export default PublicAnalytics;
