/**
 * Isolated diagram rendering test script
 * Tests each supported diagram type renders correctly with the new Inter font
 *
 * Usage: npx tsx scripts/test-diagrams.ts
 * Output: test-output/ folder with PNG files for visual inspection
 */

import { DiagramRenderer } from '../src/utils/diagram-renderer';
import fs from 'fs';
import path from 'path';

// Suppress uncaught exception from puppeteer websocket
process.on('uncaughtException', (err) => {
  if (err.message?.includes('socket hang up')) {
    // Ignore puppeteer websocket issues
    return;
  }
  console.error('Uncaught exception:', err);
  process.exit(1);
});

const TEST_OUTPUT_DIR = './test-output';

// Test diagrams for each supported type
const testDiagrams: Record<string, string> = {
  flowchart_lr: `graph LR
    A[Request] --> B[Validate] --> C[Process] --> D[Response]`,

  flowchart_td: `graph TD
    A[Start] --> B[Step 1]
    B --> C[Step 2]
    C --> D[End]`,

  timeline: `timeline
    title Project Phases
    section Phase 1
        Research : Initial exploration
    section Phase 2
        Development : Building features
    section Phase 3
        Launch : Go to market`,

  sequence: `sequenceDiagram
    participant U as User
    participant S as Server
    U->>S: Request
    S-->>U: Response`,

  journey: `journey
    title User Flow
    section Discovery
        Find product: 5: User
    section Purchase
        Add to cart: 4: User
        Checkout: 3: User`,

  pie: `pie showData
    title Distribution
    "Category A" : 40
    "Category B" : 35
    "Category C" : 25`,

  state: `stateDiagram-v2
    [*] --> Draft
    Draft --> Review
    Review --> Published
    Published --> [*]`
};

async function runTests() {
  console.log('Starting diagram rendering tests...\n');

  // Create output directory
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  const renderer = new DiagramRenderer(TEST_OUTPUT_DIR);
  await renderer.initialize();
  console.log('Browser initialized.\n');

  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const [name, code] of Object.entries(testDiagrams)) {
    console.log(`Rendering ${name}...`);
    try {
      const asset = await renderer.renderMermaidToPNG(code, name, `Test ${name}`);
      const outputPath = path.join(TEST_OUTPUT_DIR, asset.filename);
      fs.writeFileSync(outputPath, asset.buffer);
      console.log(`  ✓ Saved: ${outputPath}`);
      results.push({ name, success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Failed: ${errorMessage}`);
      results.push({ name, success: false, error: errorMessage });
    }
  }

  await renderer.close();

  // Print summary
  console.log('\n--- Summary ---');
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    results
      .filter((r) => !r.success)
      .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
  }
  console.log(`\nOutput saved to: ${path.resolve(TEST_OUTPUT_DIR)}/`);
  console.log('Open the folder to visually inspect each PNG.');
}

runTests().catch(console.error);
