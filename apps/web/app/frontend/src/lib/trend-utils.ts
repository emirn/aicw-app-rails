import { DateRange } from "react-day-picker";
import { differenceInDays, subDays } from "date-fns";

export type TrendDirection = 'up' | 'down' | 'stable' | 'no_data';

export interface ChannelTrend {
  category: 'ai' | 'search' | 'direct' | 'other' | 'total';
  currentVisitors: number;
  previousVisitors: number;
  changePercent: number;
  direction: TrendDirection;
}

export interface PreviousPeriodInfo {
  from: Date;
  to: Date;
  durationDays: number;
}

const TREND_THRESHOLD = 5; // 5% threshold for significant change

/**
 * Calculate the previous period dates based on the current date range.
 * Returns undefined if the date range is invalid or represents "All time" (>365 days).
 */
export function calculatePreviousPeriod(dateRange: DateRange | undefined): PreviousPeriodInfo | undefined {
  if (!dateRange?.from || !dateRange?.to) return undefined;

  const durationDays = differenceInDays(dateRange.to, dateRange.from) + 1;
  if (durationDays > 365) return undefined; // Skip "All time"

  const previousTo = subDays(dateRange.from, 1);
  const previousFrom = subDays(previousTo, durationDays - 1);

  return { from: previousFrom, to: previousTo, durationDays };
}

/**
 * Calculate trends for all traffic channels by comparing current vs previous period data.
 */
export function calculateTrends(
  current: { source_category: string; visitors: number }[],
  previous: { source_category: string; visitors: number }[]
): ChannelTrend[] {
  const categories = ['ai', 'search', 'direct', 'other'] as const;
  const trends: ChannelTrend[] = [];

  for (const category of categories) {
    const curr = current.find(d => d.source_category === category)?.visitors || 0;
    const prev = previous.find(d => d.source_category === category)?.visitors || 0;
    trends.push(calculateSingleTrend(category, curr, prev));
  }

  // Calculate total trend
  const currTotal = current.reduce((sum, d) => sum + d.visitors, 0);
  const prevTotal = previous.reduce((sum, d) => sum + d.visitors, 0);
  trends.push(calculateSingleTrend('total', currTotal, prevTotal));

  return trends;
}

function calculateSingleTrend(
  category: ChannelTrend['category'],
  current: number,
  previous: number
): ChannelTrend {
  if (previous === 0) {
    return {
      category,
      currentVisitors: current,
      previousVisitors: 0,
      changePercent: current > 0 ? 100 : 0,
      direction: current > 0 ? 'up' : 'no_data'
    };
  }

  const changePercent = ((current - previous) / previous) * 100;

  let direction: TrendDirection = 'stable';
  if (changePercent > TREND_THRESHOLD) {
    direction = 'up';
  } else if (changePercent < -TREND_THRESHOLD) {
    direction = 'down';
  }

  return {
    category,
    currentVisitors: current,
    previousVisitors: previous,
    changePercent,
    direction
  };
}

/**
 * Get trend for a specific category from the trends array.
 */
export function getTrendForCategory(
  trends: ChannelTrend[] | undefined,
  category: ChannelTrend['category']
): ChannelTrend | undefined {
  return trends?.find(t => t.category === category);
}

// ============================================
// Generic Item Trend Utilities
// ============================================

export interface ItemTrend {
  key: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  direction: TrendDirection;
}

/**
 * Calculate trends for a list of items by comparing current vs previous period.
 */
export function calculateItemTrends(
  current: { key: string; value: number }[],
  previous: { key: string; value: number }[]
): Map<string, ItemTrend> {
  const trends = new Map<string, ItemTrend>();

  for (const item of current) {
    const prevValue = previous.find(p => p.key === item.key)?.value || 0;
    const trend = calculateSingleItemTrend(item.key, item.value, prevValue);
    trends.set(item.key, trend);
  }

  return trends;
}

function calculateSingleItemTrend(
  key: string,
  current: number,
  previous: number
): ItemTrend {
  if (previous === 0) {
    return {
      key,
      currentValue: current,
      previousValue: 0,
      changePercent: current > 0 ? 100 : 0,
      direction: current > 0 ? 'up' : 'no_data'
    };
  }

  const changePercent = ((current - previous) / previous) * 100;

  let direction: TrendDirection = 'stable';
  if (changePercent > TREND_THRESHOLD) {
    direction = 'up';
  } else if (changePercent < -TREND_THRESHOLD) {
    direction = 'down';
  }

  return {
    key,
    currentValue: current,
    previousValue: previous,
    changePercent,
    direction
  };
}
