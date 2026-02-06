/**
 * Test script for markdown structure detection and patch validation.
 * Run with: npx ts-node test/test-markdown-structures.ts
 */

import {
  analyzeMarkdownStructures,
  isLineInProtectedRegion,
  findSafeInsertionPoint,
} from '../src/utils/markdown-structures';
import { parseLinePatches, applyPatches } from '../src/utils/articleUpdate';

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

function assertEqual<T>(actual: T, expected: T, message: string) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('\n=== Testing Markdown Structure Detection ===\n');

// Test 1: Table detection
console.log('Test 1: Table detection');
{
  const content = `# Header

| Col1 | Col2 |
|------|------|
| A    | B    |
| C    | D    |

Some text after.`;

  const analysis = analyzeMarkdownStructures(content);
  assertEqual(analysis.regions.length, 1, 'Should detect exactly 1 region');
  assertEqual(analysis.regions[0].type, 'table', 'Region should be a table');
  assertEqual(analysis.regions[0].startLine, 3, 'Table should start at line 3');
  assertEqual(analysis.regions[0].endLine, 6, 'Table should end at line 6');
}

// Test 2: Multiple tables
console.log('\nTest 2: Multiple tables');
{
  const content = `| A | B |
| 1 | 2 |

Text between.

| C | D |
| 3 | 4 |`;

  const analysis = analyzeMarkdownStructures(content);
  assertEqual(analysis.regions.length, 2, 'Should detect 2 tables');
}

// Test 3: Bullet list detection
console.log('\nTest 3: Bullet list detection');
{
  const content = `Intro text.

- Item 1
- Item 2
- Item 3

After list.`;

  const analysis = analyzeMarkdownStructures(content);
  assertEqual(analysis.regions.length, 1, 'Should detect exactly 1 region');
  assertEqual(analysis.regions[0].type, 'bullet_list', 'Region should be a bullet list');
  assertEqual(analysis.regions[0].startLine, 3, 'List should start at line 3');
  assertEqual(analysis.regions[0].endLine, 5, 'List should end at line 5');
}

// Test 4: Numbered list detection
console.log('\nTest 4: Numbered list detection');
{
  const content = `1. First
2. Second
3. Third`;

  const analysis = analyzeMarkdownStructures(content);
  assertEqual(analysis.regions.length, 1, 'Should detect exactly 1 region');
  assertEqual(analysis.regions[0].type, 'numbered_list', 'Region should be a numbered list');
}

// Test 5: Fenced code block detection
console.log('\nTest 5: Fenced code block detection');
{
  const content = `Some text.

\`\`\`javascript
const x = 1;
console.log(x);
\`\`\`

More text.`;

  const analysis = analyzeMarkdownStructures(content);
  assertEqual(analysis.regions.length, 1, 'Should detect exactly 1 region');
  assertEqual(analysis.regions[0].type, 'fenced_code', 'Region should be fenced code');
  assertEqual(analysis.regions[0].startLine, 3, 'Code block should start at line 3');
  assertEqual(analysis.regions[0].endLine, 6, 'Code block should end at line 6');
}

// Test 6: isLineInProtectedRegion
console.log('\nTest 6: isLineInProtectedRegion');
{
  const regions = [{ startLine: 5, endLine: 10, type: 'table' as const }];

  assert(isLineInProtectedRegion(3, regions) === null, 'Line 3 should not be in region');
  assert(isLineInProtectedRegion(5, regions) !== null, 'Line 5 should be in region');
  assert(isLineInProtectedRegion(7, regions) !== null, 'Line 7 should be in region');
  assert(isLineInProtectedRegion(9, regions) !== null, 'Line 9 should be in region');
  assert(isLineInProtectedRegion(10, regions) === null, 'Line 10 (end) should NOT be in region (insert after is OK)');
  assert(isLineInProtectedRegion(11, regions) === null, 'Line 11 should not be in region');
}

// Test 7: findSafeInsertionPoint
console.log('\nTest 7: findSafeInsertionPoint');
{
  const regions = [{ startLine: 5, endLine: 10, type: 'table' as const }];

  let result = findSafeInsertionPoint(3, regions, 20);
  assertEqual(result.adjusted, false, 'Line 3 should not need adjustment');
  assertEqual(result.line, 3, 'Line 3 should stay at 3');

  result = findSafeInsertionPoint(7, regions, 20);
  assertEqual(result.adjusted, true, 'Line 7 should need adjustment');
  assertEqual(result.line, 11, 'Line 7 should be adjusted to 11 (after table end at 10)');
  assertEqual(result.originalRegion?.type, 'table', 'Should report original region as table');
}

// Test 8: The actual bug case - diagram in middle of table
console.log('\nTest 8: Bug case - diagram insertion in table');
{
  const content = `# Comparison

| Feature | Tool A | Tool B |
|---------|--------|--------|
| Price | Free | $10 |
| Pro Price | $19 | $19 |
| Security | Yes | No |
| Integration | Deep | Basic |

Next section.`;

  const analysis = analyzeMarkdownStructures(content);
  assertEqual(analysis.regions.length, 1, 'Should detect 1 table');
  assertEqual(analysis.regions[0].startLine, 3, 'Table should start at line 3');
  assertEqual(analysis.regions[0].endLine, 8, 'Table should end at line 8');

  // Line 6 is "| Pro Price..." - inside the table
  const result = findSafeInsertionPoint(6, analysis.regions, analysis.lineCount);
  assertEqual(result.adjusted, true, 'Line 6 should need adjustment');
  assertEqual(result.line, 9, 'Should move to line 9 (after table end at 8)');
}

// Test 9: applyPatches with structure validation
console.log('\nTest 9: applyPatches with structure validation');
{
  const content = `# Title

| A | B |
|---|---|
| 1 | 2 |
| 3 | 4 |

After table.`;

  // Table is at lines 3-6. Patch at line 5 should be adjusted to line 7 (after table).
  const patches = [{ line: 5, content: '\nDiagram:\n```mermaid\ngraph TD\nA-->B\n```\n' }];

  const result = applyPatches(content, patches, { validateStructures: true });

  assert(typeof result === 'object', 'Should return ApplyPatchesResult object');
  if (typeof result === 'object') {
    assertEqual(result.adjustments.length, 1, 'Should have 1 adjustment');
    assertEqual(result.adjustments[0].originalLine, 5, 'Original line should be 5');
    assertEqual(result.adjustments[0].adjustedLine, 7, 'Adjusted line should be 7 (after table end at 6)');

    // Verify table is not broken in the result
    const lines = result.content.split('\n');
    const tableLines = lines.filter(l => l.startsWith('|'));
    const firstTableLineIdx = lines.findIndex(l => l.startsWith('|'));
    const lastTableLineIdx = lines.reduce((last, l, i) => l.startsWith('|') ? i : last, -1);

    // All table lines should be consecutive
    assertEqual(
      lastTableLineIdx - firstTableLineIdx + 1,
      tableLines.length,
      'Table lines should be consecutive (not interrupted by diagram)'
    );
  }
}

// Test 10: applyPatches without validation (backward compatibility)
console.log('\nTest 10: applyPatches without validation');
{
  const content = `Line 1
Line 2
Line 3`;

  const patches = [{ line: 2, content: 'Inserted' }];

  const result = applyPatches(content, patches, { validateStructures: false });

  assert(typeof result === 'string', 'Should return string when no adjustments');
  if (typeof result === 'string') {
    assert(result.includes('Inserted'), 'Content should be inserted');
  }
}

// Test 11: Nested list handling
console.log('\nTest 11: Nested list handling');
{
  const content = `- Parent 1
  - Child 1a
  - Child 1b
- Parent 2

After list.`;

  const analysis = analyzeMarkdownStructures(content);
  assertEqual(analysis.regions.length, 1, 'Should detect 1 list region (including nested)');
  assertEqual(analysis.regions[0].endLine, 4, 'List should end at line 4 (Parent 2)');
}

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
