import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import WorldMap, { CountryContext } from "react-svg-worldmap";
import { VisitsGeoData } from "@/hooks/use-visits-geo";
import { Globe, MapPin, Filter } from "lucide-react";
import { getCountryName } from "@/lib/countries";
import { TrendIndicator } from "./TrendIndicator";
import { ItemTrend } from "@/lib/trend-utils";
import type { TrafficChannel } from "@/types/tinybird";

interface GeoVisualizationProps {
  data: VisitsGeoData[];
  loading?: boolean;
  error?: Error | null;
  onCountryClick?: (country: string) => void;
  selectedCountry?: string | null;
  countryTrends?: Map<string, ItemTrend>;
  channelFilter?: TrafficChannel | null;
}

// Helper to get title based on channel filter
const getTitle = (channelFilter?: TrafficChannel | null): string => {
  if (!channelFilter) return "Visitors by Location";
  const names: Record<TrafficChannel, string> = {
    ai: "AI Visitors by Location",
    search: "Search Visitors by Location",
    direct: "Direct Visitors by Location",
    other: "Other Visitors by Location",
  };
  return names[channelFilter];
};

const getDescription = (channelFilter?: TrafficChannel | null): string => {
  if (!channelFilter) return "Geographic distribution of all visitor traffic";
  const descriptions: Record<TrafficChannel, string> = {
    ai: "Geographic distribution of AI bot traffic",
    search: "Geographic distribution of search engine traffic",
    direct: "Geographic distribution of direct traffic",
    other: "Geographic distribution of other referral traffic",
  };
  return descriptions[channelFilter];
};

export function GeoVisualization({
  data,
  loading,
  error,
  onCountryClick,
  selectedCountry,
  countryTrends,
  channelFilter,
}: GeoVisualizationProps) {
  const title = getTitle(channelFilter);
  const description = getDescription(channelFilter);

  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <CardTitle>{title}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <CardTitle>{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load geographic data. Please try again.
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
            <MapPin className="w-5 h-5 text-primary" />
            <CardTitle>{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[400px] text-center">
          <Globe className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground">
            No geographic data available for this time period.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Transform data for react-svg-worldmap
  // Map country codes to lowercase ISO2 format (US -> us, GB -> gb)
  const worldMapData = data.map((item) => ({
    country: item.country.toLowerCase(), // Convert to lowercase ISO2
    value: item.pageviews,
  }));

  // Get max value for heat map calculation
  const maxValue = Math.max(...data.map(d => d.pageviews));

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle>{title}</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Stats + Country List */}
          <div className="space-y-4 order-2 lg:order-1">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-lg border">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Countries</p>
                <p className="text-lg font-bold text-primary">{data.length}</p>
              </div>
              <div className="text-center border-x">
                <p className="text-xs text-muted-foreground">Top</p>
                <p className="text-sm font-bold truncate">{getCountryName(data[0]?.country)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Visits</p>
                <p className="text-lg font-bold text-primary">
                  {data[0]?.pageviews.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Top Countries List */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Top 12 Countries</h4>
              <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                {data.slice(0, 12).map((country, index) => {
                  const trend = countryTrends?.get(country.countryCode);
                  const isSelected = selectedCountry === country.country;
                  return (
                    <div
                      key={country.country}
                      className={`flex items-center justify-between p-1.5 rounded-md transition-colors group ${
                        onCountryClick ? "cursor-pointer hover:bg-muted/50" : ""
                      } ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}
                      onClick={() => onCountryClick?.(country.country)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-5">
                          #{index + 1}
                        </span>
                        <span className={`text-sm font-medium ${isSelected ? "text-primary" : ""}`}>
                          {getCountryName(country.country)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-muted rounded-full h-1.5 w-12">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${country.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-primary min-w-[40px] text-right">
                          {country.pageviews.toLocaleString()}
                        </span>
                        {trend && (
                          <TrendIndicator
                            direction={trend.direction}
                            changePercent={trend.changePercent}
                            className="min-w-[50px]"
                          />
                        )}
                        {onCountryClick && (
                          <Filter className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: World Map */}
          <div className="order-1 lg:order-2 min-h-[300px] lg:min-h-[350px]">
            <WorldMap
              color="hsl(var(--primary))"
              title=""
              value-suffix=" visits"
              size="lg"
              data={worldMapData}
              richInteraction
              tooltipBgColor="hsl(var(--card))"
              tooltipTextColor="hsl(var(--foreground))"
              strokeOpacity={0.6}
              styleFunction={(context: CountryContext) => {
                const countryValue = context.countryValue ?? 0;
                const isCountryWithData = countryValue > 0;
                const opacity = isCountryWithData
                  ? Math.min(0.5 + (countryValue / maxValue) * 0.5, 1)
                  : 0.2;

                return {
                  fill: isCountryWithData ? "hsl(var(--primary))" : "hsl(var(--muted))",
                  fillOpacity: opacity,
                  stroke: "hsl(var(--border))",
                  strokeWidth: 1.5,
                  strokeOpacity: 0.6,
                  cursor: onCountryClick && isCountryWithData ? "pointer" : "default",
                };
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
