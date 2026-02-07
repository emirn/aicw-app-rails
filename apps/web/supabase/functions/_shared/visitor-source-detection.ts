/**
 * AI Source Detection Module
 *
 * Detects AI service traffic from user referrals (humans using AI chat interfaces)
 * Uses weighted scoring for reliability: User Agent > Referrer > UTM
 */

import {
  type BotSourceType,
  type VisitorSourceType,
  type UtmParams,
  VISITOR_SOURCES,
  BOT_SOURCES,
} from './constants-visitor-sources.ts';


export interface VisitorSourceDetectionResult {
  visitor_source: VisitorSourceType | undefined,
  bot_source: BotSourceType | undefined,
  matched_bot_pattern?: string,  // Exact UA pattern or IP-based identifier
  rawUserAgent?: string,         // Full UA string for unknown bots (forensic analysis)
}


export async function findVisitorSource(

  params: {
    user_agent: string,
    referrer: string,
    utm_params: UtmParams,
    text_fragment: string,
  }
): Promise<VisitorSourceDetectionResult> {

  // Normalize inputs for case-insensitive matching (defensive against null/undefined)
  const ua = params.user_agent?.toLowerCase() || '';
  const ref = params.referrer?.toLowerCase() || '';

  // Detect bot by user agent (case-insensitive)
  let bot_source: BotSourceType | undefined;
  let matched_bot_pattern: string | undefined;

  for (const source of BOT_SOURCES) {
    const pattern = source.user_agents?.find(p => ua.includes(p));
    if (pattern) {
      bot_source = source;
      matched_bot_pattern = pattern;
      break;
    }
  }

  // Bot detection is mutually exclusive - if bot detected, skip visitor source detection
  if (bot_source) {
    return { visitor_source: undefined, bot_source, matched_bot_pattern };
  }

  // Only detect visitor source if NOT a bot
  const utm_src = params.utm_params.utm_source?.toLowerCase() ?? null;
  const utm_source_platform = params.utm_params.utm_source_platform?.toLowerCase() ?? null;
  const txtFrag = params.text_fragment?.trim() || '';

  const visitor_source: VisitorSourceType | undefined = VISITOR_SOURCES.find((source) => {
    let isFound: boolean = false;
    // should we check utm_source if it contains one of the possible referrers ?
    if(source.check_utm_source_for_referral && (utm_src || utm_source_platform)){
      // check if any of referrers is included in the utm source
      isFound = source.referrers.some(referrer => utm_src?.includes(referrer) || utm_source_platform?.includes(referrer));
    }
    if(isFound) return true;

    // now check if referrer includes any of the referrers indicating the source
    isFound = source.referrers.some(referrer => ref.includes(referrer));
    if (!isFound) return false;

    // if source requires text fragment (e.g., Google AI/Featured), verify it's present
    // this distinguishes AI Overview/Featured Snippet clicks from regular organic clicks
    if (source.require_text_fragment) {
      return txtFrag.length > 0;
    }

    // referrer matched and no text fragment required
    return true;

  }) ?? undefined;


  return { visitor_source: visitor_source, bot_source: bot_source, matched_bot_pattern: matched_bot_pattern };
}


/**
 * Get the display name for an AI source
 * @param id - RefSource string value
 * @returns Display name (e.g., "ChatGPT", "Perplexity")
 */
export function getOnlineSourceDisplay(name: string): string {
  return VISITOR_SOURCES.find(source => source.name === name)?.name ?? 'Unknown';
}


/**
 * Get all valid RefSource string values
 * @returns Array of all RefSource values
 */
export function getAllRefSources(): string[] {
  return VISITOR_SOURCES.map(source => source.name);
}

/**
 * Check if a string is a valid RefSource value
 * @param value - String to check
 * @returns True if valid RefSource value (empty string is valid but not a RefSource)
 */
export function isValidRefSource(value: string | null | undefined): value is string {
  if (value === null || value === undefined || value === '') return false;
  return VISITOR_SOURCES.some(source => source.name === value);
}

/**
 * Get the Google Favicon API URL for an AI source
 * @param name - Online source name
 * @param size - Icon size (16, 32, 64, 128, or 256)
 * @returns Google Favicon API URL
 */
export function getRefSourceIconUrl(id: string, defaultDomain: string = 'aicw.io', size: number = 32): string {
  const domain = VISITOR_SOURCES.find(source => source.name === id)?.referrers[0] ?? defaultDomain;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

