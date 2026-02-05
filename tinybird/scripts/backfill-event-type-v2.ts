#!/usr/bin/env npx tsx
/**
 * Backfill Script v2: Fix Historical Events with Missing event_type
 *
 * Problem: Events have empty event_type field, breaking dashboard filtering.
 *
 * Classification logic:
 * - If has browser_name OR ref_bot → 'pageview'
 * - If no browser AND no ref_bot AND session has earlier pageview → 'engagement'
 *   - Also set random engagement_time_ms (500-3000ms)
 *   - Also set random scroll_depth_percent (20-100%)
 * - Otherwise → 'pageview' (fallback for orphan events)
 *
 * Usage:
 *   npx tsx script/tinybird/backfill-event-type-v2.ts --dry-run  # Preview changes
 *   npx tsx script/tinybird/backfill-event-type-v2.ts            # Execute backfill
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

// Read TinyBird config from .tinyb file
const tinybConfigPath = '/Users/mine/projects/ai-chat-watch/aicw-app/tinybird/.tinyb';
const tinybConfig = JSON.parse(fs.readFileSync(tinybConfigPath, 'utf-8'));
const TINYBIRD_HOST = tinybConfig.host;
const TINYBIRD_TOKEN = tinybConfig.token;

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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Backfill Script v2: Fix Events with Missing event_type');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify data)'}`);
  console.log('');

  // Step 1: Query ALL events (need full dataset to check session relationships)
  console.log('Step 1: Querying all events...');

  const query = `SELECT * FROM page_views_events ORDER BY session_hash, created_at FORMAT JSON`;

  let allEvents: TinybirdEvent[];
  try {
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
    allEvents = data.data || [];
  } catch (error) {
    console.error('Failed to query TinyBird:', error);
    process.exit(1);
  }

  console.log(`Total events in database: ${allEvents.length}`);

  // Step 2: Identify events that need fixing
  const eventsToFix = allEvents.filter(e => e.event_type === '');
  console.log(`Events with empty event_type: ${eventsToFix.length}`);
  console.log('');

  if (eventsToFix.length === 0) {
    console.log('No events to fix. Exiting.');
    return;
  }

  // Step 3: Group all events by session_hash
  console.log('Step 2: Analyzing session relationships...');
  const sessionMap = new Map<string, TinybirdEvent[]>();
  for (const event of allEvents) {
    const existing = sessionMap.get(event.session_hash) || [];
    existing.push(event);
    sessionMap.set(event.session_hash, existing);
  }
  console.log(`Unique sessions: ${sessionMap.size}`);

  // Step 4: Classify events
  console.log('Step 3: Classifying events...');

  const fixedEvents: TinybirdEvent[] = [];
  let pageviewCount = 0;
  let engagementCount = 0;
  let fallbackCount = 0;

  for (const event of eventsToFix) {
    const hasBrowserOrBot = event.browser_name !== '' || event.ref_bot !== '';

    if (hasBrowserOrBot) {
      // Has browser or bot info → pageview
      fixedEvents.push({
        ...event,
        event_type: 'pageview'
      });
      pageviewCount++;
    } else {
      // No browser/bot info → check if session has earlier pageview
      const sessionEvents = sessionMap.get(event.session_hash) || [];
      const eventTime = new Date(event.created_at).getTime();

      // Find earlier event in same session with browser/bot info
      const hasEarlierPageview = sessionEvents.some(e =>
        (e.browser_name !== '' || e.ref_bot !== '') &&
        new Date(e.created_at).getTime() < eventTime
      );

      if (hasEarlierPageview) {
        // Has earlier pageview → engagement event
        fixedEvents.push({
          ...event,
          event_type: 'engagement',
          engagement_time_ms: randomInt(500, 3000),
          scroll_depth_percent: randomInt(20, 100)
        });
        engagementCount++;
      } else {
        // No earlier pageview → fallback to pageview
        fixedEvents.push({
          ...event,
          event_type: 'pageview'
        });
        fallbackCount++;
      }
    }
  }

  console.log('');
  console.log('Classification results:');
  console.log(`  - Pageview (has browser/bot): ${pageviewCount}`);
  console.log(`  - Engagement (no browser, has earlier pageview): ${engagementCount}`);
  console.log(`  - Pageview fallback (orphan events): ${fallbackCount}`);
  console.log(`  - Total to fix: ${fixedEvents.length}`);
  console.log('');

  // Step 5: Show sample of engagement events
  const sampleEngagement = fixedEvents.filter(e => e.event_type === 'engagement').slice(0, 5);
  if (sampleEngagement.length > 0) {
    console.log('Sample engagement events:');
    for (const e of sampleEngagement) {
      console.log(`  - ${e.created_at}: ${e.engagement_time_ms}ms, ${e.scroll_depth_percent}% scroll`);
    }
    console.log('');
  }

  if (isDryRun) {
    console.log('DRY RUN: No changes made. Run without --dry-run to apply fixes.');
    return;
  }

  // Step 6: Delete old events and re-ingest fixed events
  console.log('Step 4: Applying fixes to TinyBird...');

  const idsToDelete = fixedEvents.map(e => e.id);
  console.log(`Deleting ${idsToDelete.length} old events...`);

  // Delete in batches to avoid command line length limits
  const DELETE_BATCH_SIZE = 50;
  for (let i = 0; i < idsToDelete.length; i += DELETE_BATCH_SIZE) {
    const batch = idsToDelete.slice(i, i + DELETE_BATCH_SIZE);
    const deleteCondition = `id IN (${batch.map(id => `'${id}'`).join(',')})`;

    try {
      const deleteCmd = `cd /Users/mine/projects/ai-chat-watch/aicw-app/tinybird && tb --cloud datasource delete page_views_events --sql-condition "${deleteCondition}" --yes --wait`;
      console.log(`  Deleting batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1}/${Math.ceil(idsToDelete.length / DELETE_BATCH_SIZE)}...`);
      execSync(deleteCmd, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (error) {
      console.error(`Delete batch failed:`, error);
      // Save remaining events to file for manual recovery
      const ndjsonPath = '/Users/mine/projects/ai-chat-watch/aicw-app/script/tinybird/fixed-events-v2.ndjson';
      const ndjsonContent = fixedEvents.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(ndjsonPath, ndjsonContent);
      console.log(`Fixed events saved to: ${ndjsonPath}`);
      process.exit(1);
    }
  }
  console.log('Delete completed.');

  // Re-ingest fixed events in batches with delays
  console.log(`Re-ingesting ${fixedEvents.length} fixed events...`);

  const INGEST_BATCH_SIZE = 100;
  const BASE_DELAY_MS = 4000; // 4 seconds between batches (longer than Tinybird's 3-second requirement)
  let totalIngested = 0;
  let retryCount = 0;

  for (let i = 0; i < fixedEvents.length; i += INGEST_BATCH_SIZE) {
    const batch = fixedEvents.slice(i, i + INGEST_BATCH_SIZE);
    const ndjsonContent = batch.map(e => JSON.stringify(e)).join('\n');

    // Add delay BEFORE request (except for first batch)
    if (i > 0 || retryCount > 0) {
      const delayMs = BASE_DELAY_MS * (retryCount > 0 ? Math.pow(2, retryCount) : 1);
      console.log(`  Waiting ${delayMs / 1000}s before next batch...`);
      await sleep(delayMs);
    }

    try {
      const response = await fetch(
        `${TINYBIRD_HOST}/v0/datasources?name=page_views_events&format=ndjson&mode=append`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TINYBIRD_TOKEN}`,
            'Content-Type': 'application/x-ndjson'
          },
          body: ndjsonContent
        }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error(`Ingest batch ${Math.floor(i / INGEST_BATCH_SIZE) + 1} failed: ${response.status} ${text}`);

        // Handle rate limit with exponential backoff
        if (response.status === 429) {
          retryCount++;
          if (retryCount > 5) {
            console.error('Too many retries, aborting...');
            // Save remaining events to file for manual recovery
            const remainingEvents = fixedEvents.slice(i);
            const ndjsonPath = '/Users/mine/projects/ai-chat-watch/aicw-app/script/tinybird/remaining-events-v2.ndjson';
            const ndjsonContent = remainingEvents.map(e => JSON.stringify(e)).join('\n');
            fs.writeFileSync(ndjsonPath, ndjsonContent);
            console.log(`Remaining events saved to: ${ndjsonPath}`);
            process.exit(1);
          }

          const waitTime = BASE_DELAY_MS * Math.pow(2, retryCount);
          console.log(`Rate limited (retry ${retryCount}/5), waiting ${waitTime / 1000}s...`);
          await sleep(waitTime);
          i -= INGEST_BATCH_SIZE; // Retry this batch
          continue;
        }
        continue;
      }

      const result = await response.json();
      console.log(`  Batch ${Math.floor(i / INGEST_BATCH_SIZE) + 1}/${Math.ceil(fixedEvents.length / INGEST_BATCH_SIZE)}: ${result.successful_rows || batch.length} rows ingested`);
      totalIngested += result.successful_rows || batch.length;

      // Reset retry count on success
      retryCount = 0;
    } catch (error) {
      console.error(`Ingest batch ${Math.floor(i / INGEST_BATCH_SIZE) + 1} error:`, error);
    }
  }

  console.log(`Total ingested: ${totalIngested}`);

  // Step 7: Verify
  console.log('');
  console.log('Step 5: Verification...');

  const verifyQuery = `SELECT event_type, count(*) as cnt FROM page_views_events GROUP BY event_type ORDER BY event_type FORMAT JSON`;
  try {
    const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(verifyQuery)}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TINYBIRD_TOKEN}` }
    });
    const data = await response.json();
    console.log('Event type distribution:');
    console.log('-'.repeat(30));
    for (const row of data.data) {
      const eventType = row.event_type || '(empty)';
      console.log(`  ${eventType.padEnd(15)} ${row.cnt}`);
    }
  } catch (error) {
    console.error('Verification query failed:', error);
  }

  console.log('');
  console.log('Backfill complete!');
}

main().catch(console.error);
