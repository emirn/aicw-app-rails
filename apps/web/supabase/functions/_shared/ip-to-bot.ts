/**
 * IP-to-Crawler Detection Module
 *
 * This module provides functions for detecting AI crawler bots by their IP addresses.
 * It uses the ip_to_crawler_ranges table and associated lookup functions.
 *
 * @module ip-to-bot
 */

import type { BotSourceType } from './constants-visitor-sources.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export async function getBotNameByIP(
  ipAddress: string | null | undefined,
  supabaseClient: SupabaseClient
): Promise<string | null> {

  if (!ipAddress || ipAddress.trim() === '' || ipAddress === 'unknown') {
    return null; // No error log for missing IP (expected case)
  }

  try {
    // Query PostgreSQL using RPC function
    // The get_bot_by_ip function returns a single text value (bot_name) or NULL
    const { data, error } = await supabaseClient
      .rpc('get_bot_by_ip', { ip_address: ipAddress });

    if (error) {
      // Include IP prefix for debugging (server logs only, not stored)
      const ipPrefix = ipAddress.includes(':') ? ipAddress.split(':')[0] : ipAddress.split('.').slice(0, 2).join('.');
      console.error(`[IP-to-Bot] Database error for IP prefix ${ipPrefix}:`, error.message);
      return null;
    }

    // RPC function returns a single text value or null
    return (data as string | null) ?? null;

  } catch (error) {
    // Include IP prefix for debugging (server logs only, not stored)
    const ipPrefix = ipAddress.includes(':') ? ipAddress.split(':')[0] : ipAddress.split('.').slice(0, 2).join('.');
    console.error(`[IP-to-Bot] Lookup error for IP prefix ${ipPrefix}:`, error);
    return null;
  }
}
