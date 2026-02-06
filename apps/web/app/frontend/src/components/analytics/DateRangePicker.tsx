import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  className?: string;
  isPublic?: boolean;  // Restricts to "Last 7 days" only for public analytics
}

type DatePreset = {
  label: string;
  getValue: () => DateRange;
  loginRequired?: boolean;  // If true, show "(login to view)" for public users
};

const datePresets: DatePreset[] = [
  {
    label: "Today",
    getValue: () => {
      const today = new Date();
      return { from: today, to: today };
    },
    loginRequired: true,
  },
  {
    label: "Yesterday",
    getValue: () => {
      const yesterday = subDays(new Date(), 1);
      return { from: yesterday, to: yesterday };
    },
    loginRequired: true,
  },
  {
    label: "Last 3 days",
    getValue: () => ({
      from: subDays(new Date(), 2),
      to: new Date(),
    }),
    loginRequired: true,
  },
  {
    label: "Last 7 days",
    getValue: () => ({
      from: subDays(new Date(), 6),
      to: new Date(),
    }),
    // Available for public - no loginRequired
  },
  {
    label: "Last 30 days",
    getValue: () => ({
      from: subDays(new Date(), 29),
      to: new Date(),
    }),
    loginRequired: true,
  },
  {
    label: "Last 90 days",
    getValue: () => ({
      from: subDays(new Date(), 89),
      to: new Date(),
    }),
    loginRequired: true,
  },
  {
    label: "All time",
    getValue: () => ({
      from: subDays(new Date(), 365 * 10), // 10 years ago
      to: new Date(),
    }),
    loginRequired: true,
  },
];

export function DateRangePicker({
  value,
  onChange,
  className,
  isPublic = false,
}: DateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>(
    value || datePresets[3].getValue() // Default: Last 7 days
  );
  const [selectedPreset, setSelectedPreset] = React.useState<string>("Last 7 days");

  React.useEffect(() => {
    if (value) {
      setDate(value);
    }
  }, [value]);

  const handleDateChange = (newDate: DateRange | undefined) => {
    setDate(newDate);
    setSelectedPreset("Custom");
    onChange?.(newDate);
  };

  const handlePresetChange = (presetLabel: string) => {
    const preset = datePresets.find((p) => p.label === presetLabel);
    if (preset) {
      // Don't allow selecting login-required presets in public mode
      if (isPublic && preset.loginRequired) {
        return;
      }
      const newRange = preset.getValue();
      setDate(newRange);
      setSelectedPreset(presetLabel);
      onChange?.(newRange);
    }
  };

  const displayText = React.useMemo(() => {
    if (!date?.from) {
      return "Select date range";
    }
    if (!date.to) {
      return format(date.from, "LLL dd, y");
    }
    return `${format(date.from, "LLL dd, y")} - ${format(date.to, "LLL dd, y")}`;
  }, [date]);

  return (
    <div className={cn("flex flex-col sm:flex-row items-stretch sm:items-center gap-2", className)}>
      <Select value={selectedPreset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="Select preset" />
        </SelectTrigger>
        <SelectContent>
          {datePresets.map((preset) => {
            const isDisabled = isPublic && preset.loginRequired;
            const displayLabel = isDisabled
              ? `${preset.label} (login to view)`
              : preset.label;

            return (
              <SelectItem
                key={preset.label}
                value={preset.label}
                disabled={isDisabled}
                className={isDisabled ? "text-muted-foreground opacity-60" : ""}
              >
                {displayLabel}
              </SelectItem>
            );
          })}
          {!isPublic && (
            <SelectItem value="Custom">Custom</SelectItem>
          )}
        </SelectContent>
      </Select>

      {/* Calendar picker - only shown for authenticated users */}
      {isPublic ? (
        <div
          className={cn(
            "flex items-center justify-start text-left font-normal w-full sm:min-w-[260px] sm:w-auto h-10 px-4 py-2 border rounded-md bg-background text-sm",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="truncate">{displayText}</span>
        </div>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal w-full sm:min-w-[260px] sm:w-auto",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="truncate">{displayText}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={handleDateChange}
              numberOfMonths={2}
              disabled={(date) => date > new Date() || date < subDays(new Date(), 365 * 10)}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
