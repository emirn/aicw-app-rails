import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { TrendDirection } from "@/lib/trend-utils";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

interface TrendIndicatorProps {
  direction: TrendDirection;
  changePercent: number;
  periodLabel?: string;
  className?: string;
}

const TREND_CONFIG = {
  up: {
    icon: TrendingUp,
    color: 'text-green-600',
    sign: '+'
  },
  down: {
    icon: TrendingDown,
    color: 'text-red-600',
    sign: ''
  },
  stable: {
    icon: Minus,
    color: 'text-gray-500',
    sign: ''
  },
  no_data: {
    icon: Minus,
    color: 'text-gray-400',
    sign: ''
  }
} as const;

/**
 * Displays a trend indicator with icon, percentage change, and optional period label.
 * Returns null for 'no_data' direction to hide the indicator when there's no comparison data.
 */
export function TrendIndicator({
  direction,
  changePercent,
  periodLabel,
  className
}: TrendIndicatorProps) {
  // Hide indicator when there's no comparison data
  if (direction === 'no_data') {
    return null;
  }

  const config = TREND_CONFIG[direction];
  const Icon = config.icon;

  // Format the percentage text
  const text = direction === 'stable'
    ? '~0%'
    : `${config.sign}${formatPercent(changePercent)}`;

  return (
    <div className={cn("flex items-center gap-1 text-xs", config.color, className)}>
      <Icon className="h-3 w-3" />
      <span>{text}</span>
      {periodLabel && (
        <span className="text-muted-foreground ml-1">{periodLabel}</span>
      )}
    </div>
  );
}
