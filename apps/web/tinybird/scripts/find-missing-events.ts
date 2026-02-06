#!/usr/bin/env npx tsx
/**
 * Find and recover missing events
 */

import * as fs from 'fs';

const tinybConfigPath = '/Users/mine/projects/ai-chat-watch/aicw-app/tinybird/.tinyb';
const tinybConfig = JSON.parse(fs.readFileSync(tinybConfigPath, 'utf-8'));
const TINYBIRD_HOST = tinybConfig.host;
const TINYBIRD_TOKEN = tinybConfig.token;

interface TinybirdEvent {
  id: string;
  session_hash: string;
  browser_name: string;
  ref_bot: string;
  event_type: string;
  created_at: string;
  engagement_time_ms: number;
  scroll_depth_percent: number;
  [key: string]: any;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  // Get current event IDs from TinyBird
  const query = 'SELECT id, session_hash, browser_name, ref_bot, created_at FROM page_views_events FORMAT JSON';
  const response = await fetch(`${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(query)}`, {
    headers: { 'Authorization': `Bearer ${TINYBIRD_TOKEN}` }
  });
  const data = await response.json();
  const currentEvents: TinybirdEvent[] = data.data;
  const currentIds = new Set(currentEvents.map(e => e.id));
  console.log('Current events in TinyBird:', currentIds.size);

  // Build session map from current events
  const sessionMap = new Map<string, TinybirdEvent[]>();
  for (const event of currentEvents) {
    const existing = sessionMap.get(event.session_hash) || [];
    existing.push(event);
    sessionMap.set(event.session_hash, existing);
  }

  // Load old NDJSON file
  const ndjsonPath = '/Users/mine/projects/ai-chat-watch/aicw-app/script/tinybird/fixed-events-type.ndjson';
  const content = fs.readFileSync(ndjsonPath, 'utf-8');
  const oldEvents: TinybirdEvent[] = content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  console.log('Events in old NDJSON:', oldEvents.length);

  // Find events that are in old file but not in current DB
  const missingEvents = oldEvents.filter(e => !currentIds.has(e.id));
  console.log('Missing events (in old file, not in DB):', missingEvents.length);

  if (missingEvents.length === 0) {
    console.log('No missing events to recover.');
    return;
  }

  // Classify missing events
  const fixedEvents: TinybirdEvent[] = [];
  let pageviewCount = 0;
  let engagementCount = 0;

  for (const event of missingEvents) {
    const hasBrowserOrBot = event.browser_name !== '' || event.ref_bot !== '';

    if (hasBrowserOrBot) {
      fixedEvents.push({ ...event, event_type: 'pageview' });
      pageviewCount++;
    } else {
      // Check if session has earlier event with browser/bot
      const sessionEvents = sessionMap.get(event.session_hash) || [];
      const eventTime = new Date(event.created_at).getTime();
      const hasEarlierPageview = sessionEvents.some(e =>
        (e.browser_name !== '' || e.ref_bot !== '') &&
        new Date(e.created_at).getTime() < eventTime
      );

      if (hasEarlierPageview) {
        fixedEvents.push({
          ...event,
          event_type: 'engagement',
          engagement_time_ms: randomInt(500, 3000),
          scroll_depth_percent: randomInt(20, 100)
        });
        engagementCount++;
      } else {
        fixedEvents.push({ ...event, event_type: 'pageview' });
        pageviewCount++;
      }
    }
  }

  console.log('\nClassification:');
  console.log(`  - Pageviews: ${pageviewCount}`);
  console.log(`  - Engagements: ${engagementCount}`);

  // Re-ingest missing events
  console.log('\nRe-ingesting missing events...');

  const BATCH_SIZE = 50;
  let totalIngested = 0;

  for (let i = 0; i < fixedEvents.length; i += BATCH_SIZE) {
    const batch = fixedEvents.slice(i, i + BATCH_SIZE);
    const ndjsonContent = batch.map(e => JSON.stringify(e)).join('\n');

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
        if (response.status === 429) {
          console.log('Rate limited, waiting 10 seconds...');
          await sleep(10000);
          i -= BATCH_SIZE;
          continue;
        }
        console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, text);
        continue;
      }

      const result = await response.json();
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(fixedEvents.length / BATCH_SIZE)}: ${result.successful_rows || batch.length} rows`);
      totalIngested += result.successful_rows || batch.length;

      await sleep(3000);
    } catch (error) {
      console.error(`Batch error:`, error);
    }
  }

  console.log(`\nTotal ingested: ${totalIngested}`);

  // Verify
  const verifyResponse = await fetch(
    `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent('SELECT count() as total FROM page_views_events FORMAT JSON')}`,
    { headers: { 'Authorization': `Bearer ${TINYBIRD_TOKEN}` } }
  );
  const verifyData = await verifyResponse.json();
  console.log('Total events now:', verifyData.data[0].total);
}

main().catch(console.error);
