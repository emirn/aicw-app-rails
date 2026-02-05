#!/usr/bin/env npx tsx
/**
 * Backfill Script: Fix Historical Events with Missing ref_source
 *
 * Problem: Events before Nov 17, 2025 have referrer data but empty ref_source fields.
 * Solution: Query events, apply visitor source detection, delete old events, re-ingest fixed events.
 *
 * Usage:
 *   npx tsx script/tinybird/backfill-ref-source.ts --dry-run  # Preview changes
 *   npx tsx script/tinybird/backfill-ref-source.ts            # Execute backfill
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Read TinyBird config from .tinyb file
const tinybConfigPath = '/Users/mine/projects/ai-chat-watch/aicw-app/tinybird/.tinyb';
const tinybConfig = JSON.parse(fs.readFileSync(tinybConfigPath, 'utf-8'));
const TINYBIRD_HOST = tinybConfig.host;
const TINYBIRD_TOKEN = tinybConfig.token;

// Visitor sources from visitor-sources.json (simplified for backfill)
const VISITOR_SOURCES = [
  { name: 'OpenAI ChatGPT', category: 'ai', referrers: ['chat.openai.com', 'chatgpt.com', 'openai', 'chat-gpt', 'gpt', 'chat.openai'], check_utm_source: true },
  { name: 'Anthropic Claude', category: 'ai', referrers: ['claude.ai', 'anthropic', 'claude-ai'], check_utm_source: true },
  { name: 'Perplexity.AI', category: 'ai', referrers: ['perplexity.ai', 'perplexity-ai'], check_utm_source: true },
  { name: 'Google Gemini', category: 'ai', referrers: ['gemini.google.com', 'gemini', 'bard', 'google-ai'], check_utm_source: true },
  { name: 'Google AI/Featured', category: 'ai', referrers: ['google.com', 'google.co.', 'com.google.android'], require_text_fragment: true },
  { name: 'Microsoft Copilot', category: 'ai', referrers: ['copilot.microsoft.com', 'copilot', 'bing-ai', 'bing-chat', 'bing-copilot'], check_utm_source: true },
  { name: 'DeepSeek', category: 'ai', referrers: ['chat.deepseek.com', 'deepseek', 'deepseek-ai'], check_utm_source: true },
  { name: 'Meta AI', category: 'ai', referrers: ['meta.ai', 'meta', 'meta-ai', 'llama'], check_utm_source: true },
  { name: 'You.com', category: 'ai', referrers: ['you.com', 'you-com', 'youchat'], check_utm_source: true },
  { name: 'Mistral Le Chat', category: 'ai', referrers: ['mistral.ai', 'mistral', 'le-chat', 'mistral-ai'], check_utm_source: true },
  { name: 'Grok', category: 'ai', referrers: ['grok.com', 'grok', 'xai', 'x-ai'], check_utm_source: true },
  { name: 'Phind', category: 'ai', referrers: ['phind.com', 'phind-ai'], check_utm_source: true },
  { name: 'HuggingChat', category: 'ai', referrers: ['huggingface.co', 'huggingchat', 'hf'], check_utm_source: true },
  { name: 'Blackbox AI', category: 'ai', referrers: ['blackbox.ai', 'blackbox-ai'], check_utm_source: true },
  { name: 'Andi', category: 'ai', referrers: ['andisearch.com', 'andi'], check_utm_source: true },
  { name: 'Felo', category: 'ai', referrers: ['felo.ai', 'felo-ai'], check_utm_source: true },
  { name: 'Google', category: 'search', referrers: ['google.com', 'google.co.', 'com.google.android'] },
  { name: 'Bing', category: 'search', referrers: ['bing.com'] },
  { name: 'Brave', category: 'search', referrers: ['brave.com'] },
  { name: 'DuckDuckGo', category: 'search', referrers: ['duckduckgo.com'] },
  { name: 'Yahoo', category: 'search', referrers: ['yahoo.com'] },
  { name: 'Yandex', category: 'search', referrers: ['yandex.ru', 'yandex.com'] },
  { name: 'Baidu', category: 'search', referrers: ['baidu.com'] },
];

interface VisitorSource {
  name: string;
  category: string;
  referrers: string[];
  check_utm_source?: boolean;
  require_text_fragment?: boolean;
}

interface TinybirdEvent {
  id: string;
  project_id: string;
  session_hash: string;
  page_host: string;
  page_path: string;
  page_title: string;
  referrer: string;
  referrer_domain: string;
  text_fragment: string;
  browser_name: string;
  os_name: string;
  device_type: string;
  geo_country_code: string;
  geo_country_name: string;
  geo_region_code: string;
  geo_region_name: string;
  geo_city_name: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  utm_id: string;
  utm_source_platform: string;
  utm_creative_format: string;
  utm_marketing_tactic: string;
  ref_source: string;
  ref_source_category: string;
  ref_bot: string;
  ref_bot_parent_name: string;
  ref_bot_category: string;
  event_type: string;
  engagement_time_ms: number;
  scroll_depth_percent: number;
  created_at: string;
}

/**
 * Detect visitor source from referrer string
 */
function findVisitorSource(referrer: string, textFragment: string, utmSource: string | null): { name: string; category: string } | null {
  const ref = referrer?.toLowerCase() || '';
  const utm = utmSource?.toLowerCase() || '';
  const txtFrag = textFragment?.trim() || '';

  for (const source of VISITOR_SOURCES) {
    // Check if UTM source contains any referrer pattern
    if (source.check_utm_source && utm) {
      const matchesUtm = source.referrers.some(r => utm.includes(r));
      if (matchesUtm) {
        return { name: source.name, category: source.category };
      }
    }

    // Check if referrer includes any of the patterns
    const matchesRef = source.referrers.some(r => ref.includes(r));
    if (!matchesRef) continue;

    // If source requires text fragment (Google AI Overview), verify it's present
    if (source.require_text_fragment) {
      if (txtFrag.length > 0) {
        return { name: source.name, category: source.category };
      }
      // Continue to next source (might match regular Google Search)
      continue;
    }

    // Referrer matched and no text fragment required
    return { name: source.name, category: source.category };
  }

  return null;
}

/**
 * Extract domain from referrer for referrer_domain field
 */
function extractReferrerDomain(referrer: string): string {
  if (!referrer) return '';
  // Remove protocol if present
  let domain = referrer.replace(/^https?:\/\//, '');
  // Get just the domain part (before any path)
  domain = domain.split('/')[0];
  // Remove www. prefix
  domain = domain.replace(/^www\./, '');
  return domain.toLowerCase();
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Backfill Script: Fix Historical Events with Missing ref_source');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify data)'}`);
  console.log('');

  // Step 1: Query events with empty ref_source
  console.log('Step 1: Querying events with empty ref_source...');

  const query = `SELECT * FROM page_views_events WHERE ref_source = '' ORDER BY created_at FORMAT JSON`;

  let events: TinybirdEvent[];
  try {
    // Use TinyBird API directly for JSON output
    const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TINYBIRD_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`TinyBird API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    events = data.data || [];
  } catch (error) {
    console.error('Failed to query TinyBird:', error);
    process.exit(1);
  }

  console.log(`Found ${events.length} events with empty ref_source`);
  console.log('');

  // Step 2: Analyze and fix events
  console.log('Step 2: Analyzing events and computing ref_source...');

  const fixedEvents: TinybirdEvent[] = [];
  const unchangedEvents: TinybirdEvent[] = [];
  const stats: Record<string, number> = {};

  for (const event of events) {
    const source = findVisitorSource(event.referrer, event.text_fragment, event.utm_source);
    const referrerDomain = extractReferrerDomain(event.referrer);

    if (source || referrerDomain !== event.referrer_domain) {
      // Create fixed event
      const fixedEvent: TinybirdEvent = {
        ...event,
        referrer_domain: referrerDomain || event.referrer_domain,
        ref_source: source?.name || '',
        ref_source_category: source?.category || '',
      };
      fixedEvents.push(fixedEvent);

      // Track stats
      const key = source?.name || 'no_match';
      stats[key] = (stats[key] || 0) + 1;
    } else {
      unchangedEvents.push(event);
    }
  }

  console.log(`Events to fix: ${fixedEvents.length}`);
  console.log(`Events unchanged: ${unchangedEvents.length}`);
  console.log('');
  console.log('Detection breakdown:');
  for (const [source, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source}: ${count}`);
  }
  console.log('');

  // Step 3: Show sample of fixes
  console.log('Step 3: Sample of fixes:');
  console.log('-'.repeat(60));
  for (const event of fixedEvents.slice(0, 10)) {
    console.log(`  ${event.referrer} -> ${event.ref_source || '(no source)'} [${event.ref_source_category || 'empty'}]`);
  }
  if (fixedEvents.length > 10) {
    console.log(`  ... and ${fixedEvents.length - 10} more`);
  }
  console.log('');

  if (isDryRun) {
    console.log('DRY RUN: No changes made. Run without --dry-run to apply fixes.');
    return;
  }

  if (fixedEvents.length === 0) {
    console.log('No events to fix. Exiting.');
    return;
  }

  // Step 4: Delete old events and re-ingest fixed events
  console.log('Step 4: Applying fixes to TinyBird...');

  // Get IDs of events to delete
  const idsToDelete = fixedEvents.map(e => e.id);

  // Delete events by IDs (using TinyBird API)
  console.log(`Deleting ${idsToDelete.length} old events...`);

  // TinyBird delete requires specific format - delete by condition
  // We'll delete events by their IDs
  const deleteCondition = `id IN (${idsToDelete.map(id => `'${id}'`).join(',')})`;

  try {
    // Use TinyBird CLI to delete with --sql-condition
    const deleteCmd = `cd /Users/mine/projects/ai-chat-watch/aicw-app/tinybird && tb --cloud datasource delete page_views_events --sql-condition "${deleteCondition}" --yes --wait`;
    console.log('Running delete command...');
    execSync(deleteCmd, { encoding: 'utf-8', stdio: 'inherit' });
    console.log('Delete completed.');
  } catch (error) {
    console.error('Delete failed:', error);
    console.log('');
    console.log('Alternative: Writing fixed events to NDJSON file for manual import...');

    // Write to NDJSON file for manual import
    const ndjsonPath = '/Users/mine/projects/ai-chat-watch/aicw-app/script/tinybird/fixed-events.ndjson';
    const ndjsonContent = fixedEvents.map(e => JSON.stringify(e)).join('\n');
    fs.writeFileSync(ndjsonPath, ndjsonContent);
    console.log(`Written ${fixedEvents.length} events to: ${ndjsonPath}`);
    console.log('');
    console.log('To manually apply:');
    console.log('1. Delete old events from TinyBird console');
    console.log('2. Import: tb --cloud datasource append page_views_events --format ndjson < fixed-events.ndjson');
    return;
  }

  // Re-ingest fixed events using TinyBird API
  console.log(`Re-ingesting ${fixedEvents.length} fixed events...`);

  const ndjsonContent = fixedEvents.map(e => JSON.stringify(e)).join('\n');

  try {
    const response = await fetch(
      `${TINYBIRD_HOST}/v0/datasources?name=page_views_events&format=ndjson&mode=append`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TINYBIRD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: ndjsonContent
      }
    );

    if (!response.ok) {
      throw new Error(`TinyBird ingest error: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();
    console.log(`Ingest completed: ${result.successful_rows} rows ingested`);
  } catch (error) {
    console.error('Ingest failed:', error);

    // Save to file as backup
    const ndjsonPath = '/Users/mine/projects/ai-chat-watch/aicw-app/script/tinybird/fixed-events.ndjson';
    fs.writeFileSync(ndjsonPath, ndjsonContent);
    console.log(`Fixed events saved to: ${ndjsonPath}`);
    process.exit(1);
  }

  // Step 5: Verify
  console.log('');
  console.log('Step 5: Verification...');

  const verifyQuery = `SELECT toDate(created_at) as date, count(*) as total, countIf(ref_source != '') as with_source FROM page_views_events GROUP BY date ORDER BY date FORMAT JSON`;
  try {
    const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(verifyQuery)}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TINYBIRD_TOKEN}` }
    });
    const data = await response.json();
    console.log('Date           Total  With Source');
    console.log('-'.repeat(35));
    for (const row of data.data) {
      console.log(`${row.date}   ${String(row.total).padStart(5)}  ${String(row.with_source).padStart(5)}`);
    }
  } catch (error) {
    console.error('Verification query failed:', error);
  }

  console.log('');
  console.log('Backfill complete!');
}

main().catch(console.error);
