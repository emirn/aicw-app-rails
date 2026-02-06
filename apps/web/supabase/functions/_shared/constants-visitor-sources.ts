export interface VisitorSourceType {
  name: string,
  url?: string,
  category: 'ai' | 'search' | 'social' | 'video' | 'dataset' | 'other',
  referrers: string[];
  check_utm_source_for_referral?: boolean;
  require_text_fragment?: boolean;
}

export interface UtmParams {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  utm_id?: string | null;
  utm_source_platform?: string | null;
  utm_creative_format?: string | null;
  utm_marketing_tactic?: string | null;
}

export interface BotSourceType {
  desc: string,
  ref_bot_parent_name: string,
  parent_url: string,
  ref_bot_category: string,  // e.g., 'ai', 'search', 'other - headless browser'
  user_agents?: string[],
  ip_ranges_url?: string,
}

import visitorSources from './visitor-sources.json' assert { type: 'json' };
import botSources from './bot-sources.json' assert { type: 'json' };

export const VISITOR_SOURCES: Array<VisitorSourceType> = visitorSources as Array<VisitorSourceType>;

// Normalize bot user agent patterns to lowercase and log warnings for any uppercase patterns
export const BOT_SOURCES: Array<BotSourceType> = (botSources as Array<BotSourceType>).map(source => ({
  ...source,
  user_agents: source.user_agents?.map(ua => {
    if (ua !== ua.toLowerCase()) {
      console.warn(`[CONFIG] Bot user agent should be lowercase: "${ua}" in ${source.desc}`);
      return ua.toLowerCase();
    }
    return ua;
  })
}));


