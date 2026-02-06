#!/usr/bin/env node

/**
 * Validate AICW Tracking Script Syntax
 *
 * Checks JavaScript syntax before minification to catch errors early
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Configuration
const SOURCE_FILE = path.join(__dirname, 'src', 'aicw-view.js');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateSyntax(code, filename) {
  try {
    // Create a new context to parse the code
    // This validates syntax without executing the code
    new vm.Script(code, { filename });
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      line: error.stack.match(/(\d+):/)?.[1] || 'unknown'
    };
  }
}

function main() {
  try {
    log('⚙️  Validating tracking script syntax...', 'yellow');

    // Check if source file exists
    if (!fs.existsSync(SOURCE_FILE)) {
      log(`❌ Source file not found: ${SOURCE_FILE}`, 'red');
      process.exit(1);
    }

    // Read source code
    const sourceCode = fs.readFileSync(SOURCE_FILE, 'utf8');
    const relativePath = path.relative(process.cwd(), SOURCE_FILE);

    // Validate syntax
    const result = validateSyntax(sourceCode, relativePath);

    if (!result.valid) {
      log('', 'reset');
      log('❌ Syntax Error in tracking script:', 'red');
      log(`   File: ${relativePath}`, 'gray');
      log(`   Line: ${result.line}`, 'gray');
      log(`   Error: ${result.error}`, 'red');
      log('', 'reset');
      log('Fix the syntax error and try again.', 'yellow');
      process.exit(1);
    }

    log(`✅ Syntax valid: ${relativePath}`, 'green');
    process.exit(0);

  } catch (error) {
    log('\n❌ Validation failed:', 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { validateSyntax };
