import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { getVisitorSourceDisplay, getAllVisitorSources } from "@/lib/ai-sources";
import { AISourceIcon } from "./AISourceIcon";

export interface AnalyticsFilterState {
  aiBot?: string;
  country?: string;
  deviceType?: string;
  pagePath?: string;
}

interface AnalyticsFiltersProps {
  filters: AnalyticsFilterState;
  onChange: (filters: AnalyticsFilterState) => void;
  availableCountries?: string[];
}

const DEVICE_TYPE_OPTIONS = [
  { value: 'desktop', label: "Desktop" },
  { value: 'mobile', label: "Mobile" },
  { value: 'tablet', label: "Tablet" },
];

export function AnalyticsFilters({
  filters,
  onChange,
  availableCountries = [],
}: AnalyticsFiltersProps) {
  const hasActiveFilters = Object.keys(filters).some(
    (key) => filters[key as keyof AnalyticsFilterState] !== undefined
  );

  const clearAllFilters = () => {
    onChange({});
  };

  const clearFilter = (key: keyof AnalyticsFilterState) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    onChange(newFilters);
  };

  const updateFilter = (key: keyof AnalyticsFilterState, value: any) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  // Get all AI sources
  const aiSources = getAllVisitorSources();

  return (
    <div className="space-y-3">
      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.aiBot}
          onValueChange={(value) =>
            updateFilter("aiBot", value === "all" ? undefined : value)
          }
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All AI Bots">
              {filters.aiBot !== undefined && (
                <div className="flex items-center gap-2">
                  <AISourceIcon refSource={filters.aiBot} size={16} />
                  <span>{getVisitorSourceDisplay(filters.aiBot)}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All AI Bots</SelectItem>
            {aiSources.map((source) => (
              <SelectItem key={source} value={source}>
                <div className="flex items-center gap-2">
                  <AISourceIcon refSource={source} size={16} />
                  <span>{getVisitorSourceDisplay(source)}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {availableCountries.length > 0 && (
          <Select
            value={filters.country}
            onValueChange={(value) =>
              updateFilter("country", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {availableCountries.slice(0, 20).map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.deviceType}
          onValueChange={(value) =>
            updateFilter("deviceType", value === "all" ? undefined : value)
          }
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Devices" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Devices</SelectItem>
            {DEVICE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-muted-foreground"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Active Filters */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.aiBot !== undefined && (
            <Badge variant="secondary" className="gap-1.5 pr-1">
              <AISourceIcon refSource={filters.aiBot} size={14} />
              {getVisitorSourceDisplay(filters.aiBot)}
              <button
                className="p-1 -m-0.5 rounded hover:bg-destructive/10"
                onClick={() => clearFilter("aiBot")}
              >
                <X className="h-3 w-3 hover:text-destructive" />
              </button>
            </Badge>
          )}
          {filters.country && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Country: {filters.country}
              <button
                className="p-1 -m-0.5 rounded hover:bg-destructive/10"
                onClick={() => clearFilter("country")}
              >
                <X className="h-3 w-3 hover:text-destructive" />
              </button>
            </Badge>
          )}
          {filters.deviceType !== undefined && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Device:{" "}
              {DEVICE_TYPE_OPTIONS.find((d) => d.value === filters.deviceType)?.label}
              <button
                className="p-1 -m-0.5 rounded hover:bg-destructive/10"
                onClick={() => clearFilter("deviceType")}
              >
                <X className="h-3 w-3 hover:text-destructive" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
