/**
 * Tinybird Pipe Response Types
 *
 * These types match the output of Tinybird pipes defined in /tinybird/pipes/
 */

/**
 * Response from analytics_overview.pipe
 * Main dashboard statistics
 */
export interface AnalyticsOverview {
  total_pageviews: number;
  total_visitors: number;
  ai_pageviews: number;
  ai_visitors: number;
  ai_percentage: number;
  top_ai_source_id: string;
  top_ai_source_pageviews: number;
  top_ai_source_visitors: number;
  unique_countries: number;
  unique_pages: number;
}

/**
 * Response from ai_sources_breakdown.pipe
 * Breakdown of visits by AI source
 */
export interface AISourceBreakdown {
  ref_source: string;
  pageviews: number;
  visitors: number;
  percentage: number;
}

/**
 * Response from ai_visits_timeseries.pipe
 * Time-series data for charts
 */
export interface AIVisitsTimeSeries {
  date_bucket: string; // Date or DateTime string
  total_pageviews: number;
  total_visitors: number;
  ai_pageviews: number;
  ai_visitors: number;
  ai_percentage: number;
}

/**
 * Response from ai_visits_geo.pipe
 * Geographic distribution of visits
 */
export interface AIVisitsGeo {
  country_code: string;
  pageviews: number;
  visitors: number;
  percentage: number;
}

/**
 * Response from top_pages.pipe
 * Top pages ranked by AI traffic
 */
export interface TopPage {
  page_path: string;
  page_title: string;
  total_pageviews: number;
  total_visitors: number;
  ai_pageviews: number;
  ai_visitors: number;
  ai_percentage: number;
  top_ai_source: string;
}

/**
 * Response from traffic_sources.pipe
 * Traffic source categorization
 */
export interface TrafficSource {
  source_category: 'AI' | 'Search' | 'direct' | 'other';
  pageviews: number;
  visitors: number;
  percentage: number;
  unique_pages: number;
  page_percentage: number;
}

/**
 * Response from top_pages_by_channel.pipe
 * Content performance by channel (Direct, Search, AI Chats)
 */
export interface TopPageByChannel {
  page_path: string;
  page_title: string;
  direct_pageviews: number;
  direct_visitors: number;
  search_pageviews: number;
  search_visitors: number;
  ai_pageviews: number;
  ai_visitors: number;
  other_pageviews: number;
  other_visitors: number;
  total_pageviews: number;
  total_visitors: number;
  top_ai_sources: string; // Comma-separated list of top 5 AI source names
  top_search_sources?: string; // Comma-separated list of top 5 search source names
  top_other_sources?: string; // Comma-separated list of top 5 other referrer domains
}

/**
 * Response from traffic_trend_by_channel.pipe
 * Time-series data by channel for stacked area chart
 */
export interface TrafficTrendByChannel {
  date_bucket: string; // Date or DateTime string
  ai_pageviews: number;
  ai_visitors: number;
  search_pageviews: number;
  search_visitors: number;
  direct_pageviews: number;
  direct_visitors: number;
  other_pageviews: number;
  other_visitors: number;
  total_pageviews: number;
  total_visitors: number;
}

/**
 * Response from traffic_trend_by_source.pipe
 * Time-series data by individual source for detailed breakdown chart
 */
export interface TrafficTrendBySource {
  date_bucket: string; // Date or DateTime string
  source_key: string; // Source identifier (e.g., "ChatGPT", "Google", "github.com", "Direct")
  channel: 'ai' | 'search' | 'direct' | 'other';
  pageviews: number;
  visitors: number;
}

/**
 * Time interval options for time-series queries
 */
export type TimeInterval = 'day' | 'week' | 'month';

/**
 * Traffic channel types for filtering
 */
export type TrafficChannel = 'ai' | 'search' | 'direct' | 'other';

/**
 * Query parameters for Tinybird pipes
 */
export interface TinybirdQueryParams {
  project_id: string;
  start_date?: string; // ISO 8601 datetime string
  end_date?: string; // ISO 8601 datetime string
  interval?: TimeInterval;
  channel?: TrafficChannel; // Filter by traffic channel
  ref_source_filter?: string;
  page_path?: string; // Filter by specific page path
  limit?: number;
}

/**
 * Response from visits_geo.pipe (renamed from ai_visits_geo.pipe)
 * Geographic distribution of visits with optional channel filter
 */
export interface VisitsGeo {
  country_code: string;
  pageviews: number;
  visitors: number;
  percentage: number;
}

/**
 * Response from summarize_clicks_overview.pipe
 * Overview of summarize click events by AI service
 */
export interface SummarizeClickOverview {
  ai_service: string;
  click_count: number;
  unique_sessions: number;
  percentage: number;
  total_opens: number;
  total_clicks: number;
  click_through_rate: number;
}

/**
 * Response from summarize_clicks_timeseries.pipe
 * Time-series data for summarize click events
 */
export interface SummarizeClickTimeSeries {
  date_bucket: string;
  clicks: number;
  unique_sessions: number;
}

/**
 * Response from summarize_clicks_by_page.pipe
 * Summarize clicks grouped by page and AI service
 */
export interface SummarizeClickByPage {
  page_path: string;
  ai_service: string;
  click_count: number;
  unique_sessions: number;
}

/**
 * Response from share_clicks_overview.pipe
 * Overview of share click events by service
 */
export interface ShareClickOverview {
  share_service: string;
  click_count: number;
  unique_sessions: number;
  percentage: number;
  total_clicks: number;
}

/**
 * Response from share_clicks_timeseries.pipe
 * Time-series data for share click events
 */
export interface ShareClickTimeSeries {
  date_bucket: string;
  clicks: number;
  unique_sessions: number;
}

/**
 * Response from share_clicks_by_page.pipe
 * Share clicks grouped by page and share service
 */
export interface ShareClickByPage {
  page_path: string;
  share_service: string;
  click_count: number;
  unique_sessions: number;
}
