// =============================================================================
// Bot Detection Module
// =============================================================================
// Centralized bot detection with fallback for unknown bots.
// =============================================================================

import { BOT_SOURCES } from "./constants-visitor-sources.ts";

// generic bot patterns to catch unknown bots
const GENERIC_BOT_PATTERNS = [
  'fetch',
  'crawl',
  'scrap',
  'spider',
  'fetch',
  'bot'
];

export const MAX_USER_AGENT_LENGTH = 500; // max user agent length to store in database
export const MIN_USER_AGENT_LENGTH = 10; // min user agent length to detect a bot

export interface BotDetectionResult {
  isBot: boolean;
  matchedPattern?: string;    // Exact UA pattern matched (e.g., "gptbot", "selenium")
  botParentName?: string;
  botCategory?: string;
  rawUserAgent?: string;      // Full UA string for unknown bots (forensic analysis)
}


/**
 * Detect bot from user agent and return bot info
 * Returns the exact matched pattern (e.g., "gptbot") instead of the group description
 */
export function detectBotFromUA(userAgent: string | null | undefined): BotDetectionResult {
  if (!userAgent || userAgent.trim().length < MIN_USER_AGENT_LENGTH) {
    return { isBot: true, matchedPattern: 'no-ua', botParentName: 'Unknown', botCategory: 'unknown' };
  }

  const ua = userAgent.toLowerCase();

  // 1. Check known bots from bot-sources.json
  for (const bot of BOT_SOURCES) {
    const matchedPattern = bot.user_agents?.find(pattern => ua.includes(pattern));
    if (matchedPattern) {
      return {
        isBot: true,
        matchedPattern,
        botParentName: bot.ref_bot_parent_name,
        botCategory: bot.ref_bot_category
      };
    }
  }

  // 2. Fallback: generic patterns for unknown bots
  for (const pattern of GENERIC_BOT_PATTERNS) {
    if (ua.includes(pattern)) {
      return {
        isBot: true,
        matchedPattern: pattern,
        botParentName: 'Unknown',
        botCategory: 'unknown',
        // Store full UA for unknown bots (truncated to 500 chars for storage safety)
        rawUserAgent: userAgent.substring(0, MAX_USER_AGENT_LENGTH)
      };
    }
  }

  return { isBot: false };
}
