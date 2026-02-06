#!/usr/bin/env npx tsx
/**
 * Re-ingest fixed events from NDJSON file
 */

import * as fs from 'fs';
import * as path from 'path';

// Load TinyBird credentials from .tinyb config file (gitignored)
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const tinybConfigPath = path.join(scriptDir, '../../tinybird/.tinyb');
const tinybConfig = JSON.parse(fs.readFileSync(tinybConfigPath, 'utf-8'));
const TINYBIRD_HOST = tinybConfig.host;
const TINYBIRD_TOKEN = tinybConfig.token;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const ndjsonPath = '/Users/mine/projects/ai-chat-watch/aicw-app/script/tinybird/fixed-events-type.ndjson';
  const content = fs.readFileSync(ndjsonPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  // Skip already ingested (first 400)
  const startOffset = parseInt(process.argv[2] || '0');
  console.log(`Re-ingesting ${lines.length} events starting from offset ${startOffset}...`);

  // Ingest in batches with delay to avoid rate limits
  const BATCH_SIZE = 100;
  let totalIngested = 0;

  for (let i = startOffset; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    const batchContent = batch.join('\n');

    try {
      const response = await fetch(
        `${TINYBIRD_HOST}/v0/datasources?name=page_views_events&format=ndjson&mode=append`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TINYBIRD_TOKEN}`,
            'Content-Type': 'application/x-ndjson'
          },
          body: batchContent
        }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${response.status} ${text}`);
        // Wait and retry on rate limit
        if (response.status === 429) {
          console.log('Rate limited, waiting 10 seconds...');
          await sleep(10000);
          i -= BATCH_SIZE; // Retry this batch
        }
        continue;
      }

      const result = await response.json();
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(lines.length / BATCH_SIZE)}: ${result.successful_rows || batch.length} rows, quarantine: ${result.quarantine_rows}, invalid: ${result.invalid_lines}`);
      totalIngested += result.successful_rows || batch.length;

      // Add delay between batches to avoid rate limits
      await sleep(3000);
    } catch (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error);
    }
  }

  console.log(`\nTotal ingested: ${totalIngested}`);

  // Verify
  console.log('\nVerifying...');
  const verifyQuery = `SELECT count() as total FROM page_views_events FORMAT JSON`;
  const response = await fetch(
    `${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(verifyQuery)}`,
    {
      headers: { 'Authorization': `Bearer ${TINYBIRD_TOKEN}` }
    }
  );
  const data = await response.json();
  console.log(`Total events in database: ${data.data[0].total}`);
}

main().catch(console.error);
