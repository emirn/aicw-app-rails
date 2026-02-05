#!/usr/bin/env npx tsx
/**
 * Backfill Script: Fix Historical Events with Missing event_type
 *
 * Problem: Events before Nov 28, 2025 have empty event_type field.
 * The TinyBird pipes filter by event_type = 'pageview', so old events are excluded.
 * Solution: Set event_type = 'pageview' for all events with empty event_type.
 *
 * Usage:
 *   npx tsx script/tinybird/backfill-event-type.ts --dry-run  # Preview changes
 *   npx tsx script/tinybird/backfill-event-type.ts            # Execute backfill
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

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Backfill Script: Fix Events with Missing event_type');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify data)'}`);
  console.log('');

  // Step 1: Query events with empty event_type
  console.log('Step 1: Querying events with empty event_type...');

  const query = `SELECT * FROM page_views_events WHERE event_type = '' ORDER BY created_at FORMAT JSON`;

  let events: TinybirdEvent[];
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
    events = data.data || [];
  } catch (error) {
    console.error('Failed to query TinyBird:', error);
    process.exit(1);
  }

  console.log(`Found ${events.length} events with empty event_type`);
  console.log('');

  if (events.length === 0) {
    console.log('No events to fix. Exiting.');
    return;
  }

  // Step 2: Group by date to show distribution
  console.log('Step 2: Distribution by date:');
  const byDate: Record<string, number> = {};
  for (const event of events) {
    const date = event.created_at.split('T')[0];
    byDate[date] = (byDate[date] || 0) + 1;
  }
  for (const [date, count] of Object.entries(byDate).sort()) {
    console.log(`  ${date}: ${count} events`);
  }
  console.log('');

  // Step 3: Fix events - set event_type = 'pageview'
  console.log('Step 3: Setting event_type = "pageview" for all empty events...');

  const fixedEvents: TinybirdEvent[] = events.map(event => ({
    ...event,
    event_type: 'pageview'
  }));

  console.log(`Events to fix: ${fixedEvents.length}`);
  console.log('');

  if (isDryRun) {
    console.log('DRY RUN: No changes made. Run without --dry-run to apply fixes.');
    return;
  }

  // Step 4: Delete old events and re-ingest fixed events
  console.log('Step 4: Applying fixes to TinyBird...');

  const idsToDelete = fixedEvents.map(e => e.id);
  console.log(`Deleting ${idsToDelete.length} old events...`);

  // Delete in batches to avoid command line length limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
    const batch = idsToDelete.slice(i, i + BATCH_SIZE);
    const deleteCondition = `id IN (${batch.map(id => `'${id}'`).join(',')})`;

    try {
      const deleteCmd = `cd /Users/mine/projects/ai-chat-watch/aicw-app/tinybird && tb --cloud datasource delete page_views_events --sql-condition "${deleteCondition}" --yes --wait`;
      console.log(`  Deleting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(idsToDelete.length / BATCH_SIZE)}...`);
      execSync(deleteCmd, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (error) {
      console.error(`Delete batch failed:`, error);
      // Save remaining events to file for manual recovery
      const ndjsonPath = '/Users/mine/projects/ai-chat-watch/aicw-app/script/tinybird/fixed-events-type.ndjson';
      const ndjsonContent = fixedEvents.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(ndjsonPath, ndjsonContent);
      console.log(`Fixed events saved to: ${ndjsonPath}`);
      process.exit(1);
    }
  }
  console.log('Delete completed.');

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
    console.log(`Ingest completed: ${result.successful_rows || fixedEvents.length} rows ingested`);
  } catch (error) {
    console.error('Ingest failed:', error);
    const ndjsonPath = '/Users/mine/projects/ai-chat-watch/aicw-app/script/tinybird/fixed-events-type.ndjson';
    fs.writeFileSync(ndjsonPath, ndjsonContent);
    console.log(`Fixed events saved to: ${ndjsonPath}`);
    process.exit(1);
  }

  // Step 5: Verify
  console.log('');
  console.log('Step 5: Verification...');

  const verifyQuery = `SELECT toDate(created_at) as date, event_type, count(*) as cnt FROM page_views_events GROUP BY date, event_type ORDER BY date, event_type FORMAT JSON`;
  try {
    const url = `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(verifyQuery)}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TINYBIRD_TOKEN}` }
    });
    const data = await response.json();
    console.log('Date           Event Type      Count');
    console.log('-'.repeat(45));
    for (const row of data.data) {
      const eventType = row.event_type || '(empty)';
      console.log(`${row.date}   ${eventType.padEnd(15)} ${row.cnt}`);
    }
  } catch (error) {
    console.error('Verification query failed:', error);
  }

  console.log('');
  console.log('Backfill complete!');
}

main().catch(console.error);
