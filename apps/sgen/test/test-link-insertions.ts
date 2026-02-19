/**
 * Test script for applyLinkInsertions overlap detection.
 * Run with: npx ts-node test/test-link-insertions.ts
 */

import { applyLinkInsertions } from '../src/utils/articleUpdate';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

console.log('\n=== Testing applyLinkInsertions Overlap Detection ===\n');

// Test 1: Overlapping anchors — longer one applied first, shorter skipped
console.log('Test 1: Overlapping anchors (substring match)');
{
  const content = 'Your vendor contract review checklist should verify all terms before signing.';
  const links = [
    { anchor_text: 'vendor contract review checklist', url: 'https://example.com/checklist' },
    { anchor_text: 'vendor contract review', url: 'https://example.com/review' },
  ];

  const { result, applied, skipped } = applyLinkInsertions(content, links);

  assert(applied === 1, `Should apply exactly 1 link (got ${applied})`);
  assert(
    result.includes('[vendor contract review checklist](https://example.com/checklist)'),
    'Should contain the longer anchor link'
  );
  assert(
    !result.includes('[['),
    'Should NOT contain nested brackets [['
  );
  assert(
    skipped.some(s => s.includes('already linked')),
    'Shorter anchor should be skipped as "already linked"'
  );
}

// Test 2: Non-overlapping anchors — both applied
console.log('\nTest 2: Non-overlapping anchors');
{
  const content = 'The vendor contract review is important. You also need a compliance audit process.';
  const links = [
    { anchor_text: 'vendor contract review', url: 'https://example.com/review' },
    { anchor_text: 'compliance audit process', url: 'https://example.com/audit' },
  ];

  const { result, applied } = applyLinkInsertions(content, links);

  assert(applied === 2, `Should apply both links (got ${applied})`);
  assert(
    result.includes('[vendor contract review](https://example.com/review)'),
    'Should contain first link'
  );
  assert(
    result.includes('[compliance audit process](https://example.com/audit)'),
    'Should contain second link'
  );
}

// Test 3: Exact full-text match inside existing link — already linked detection
console.log('\nTest 3: Exact match inside existing markdown link');
{
  const content = 'Check our [vendor contract review](https://existing.com/link) for details.';
  const links = [
    { anchor_text: 'vendor contract review', url: 'https://example.com/new' },
  ];

  const { result, applied, skipped } = applyLinkInsertions(content, links);

  assert(applied === 0, `Should apply 0 links (got ${applied})`);
  assert(
    skipped.some(s => s.includes('already linked')),
    'Should be skipped as "already linked"'
  );
  assert(
    !result.includes('[['),
    'Should NOT create nested links'
  );
}

// Test 4: Partial match at start of link text — should detect as inside link
console.log('\nTest 4: Partial match at start of existing link text');
{
  const content = 'See the [vendor contract review checklist](https://existing.com/link) for guidance.';
  const links = [
    { anchor_text: 'vendor contract review', url: 'https://example.com/new' },
  ];

  const { result, applied } = applyLinkInsertions(content, links);

  assert(applied === 0, `Should apply 0 links — match is inside existing link (got ${applied})`);
  assert(
    !result.includes('[['),
    'Should NOT create nested links'
  );
}

// Test 5: Partial match at end of link text — should detect as inside link
console.log('\nTest 5: Partial match at end of existing link text');
{
  const content = 'Use the [complete vendor contract review](https://existing.com/link) template.';
  const links = [
    { anchor_text: 'vendor contract review', url: 'https://example.com/new' },
  ];

  const { result, applied } = applyLinkInsertions(content, links);

  assert(applied === 0, `Should apply 0 links — match is inside existing link (got ${applied})`);
  assert(
    !result.includes('[['),
    'Should NOT create nested links'
  );
}

// Test 6: Match NOT inside a link — should be applied
console.log('\nTest 6: Match not inside any link');
{
  const content = 'A good vendor contract review process helps. See [other resource](https://other.com) too.';
  const links = [
    { anchor_text: 'vendor contract review', url: 'https://example.com/review' },
  ];

  const { result, applied } = applyLinkInsertions(content, links);

  assert(applied === 1, `Should apply 1 link (got ${applied})`);
  assert(
    result.includes('[vendor contract review](https://example.com/review)'),
    'Should contain the link'
  );
}

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
