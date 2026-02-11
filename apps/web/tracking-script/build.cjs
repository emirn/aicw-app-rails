#!/usr/bin/env node

/**
 * Build AICW Tracking Script
 *
 * Complete build pipeline for the tracking script:
 * 1. Validate syntax (stop if errors found)
 * 2. Minify with terser
 * 3. Copy to deployment location
 *
 * HOW TO RUN:
 * -----------
 * npm run build
 *
 * WHAT IT DOES:
 * -------------
 * - Validates: src/aicw-view.js (syntax check)
 * - Minifies: using terser with compression and mangling
 * - Writes: dist/aicw-view.min.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const SOURCE_FILE = path.join(__dirname, 'src', 'aicw-view.js');
const OUTPUT_FILE = path.join(__dirname, 'dist', 'aicw-view.min.js');
const VERSION_FILE = path.join(__dirname, 'dist', '.version');
const VALIDATOR_SCRIPT = path.join(__dirname, 'validate.cjs');

// Generate version string in format YYYYMMDD.HHMMSS
function generateVersion() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}.${time}`;
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return (stats.size / 1024).toFixed(2);
}

function main() {
  try {
    log('\n🔨 Building AICW Tracking Script...', 'blue');
    log(colors.gray + '─'.repeat(50) + colors.reset);

    // Step 1: Validate syntax
    log('📋 Step 1/3: Validating syntax...', 'blue');
    try {
      execSync(`node "${VALIDATOR_SCRIPT}"`, { stdio: 'inherit' });
    } catch (error) {
      log('❌ Build stopped due to validation errors', 'red');
      process.exit(1);
    }

    log('');

    // Step 2: Minify
    log('📋 Step 2/3: Minifying...', 'blue');

    // Check if source file exists
    if (!fs.existsSync(SOURCE_FILE)) {
      log(`❌ Source file not found: ${SOURCE_FILE}`, 'red');
      process.exit(1);
    }

    const sourceSizeBefore = getFileSize(SOURCE_FILE);
    log(`   Source: ${path.relative(process.cwd(), SOURCE_FILE)} (${sourceSizeBefore} KB)`, 'gray');

    // Run terser to minify
    const command = `npx -y terser "${SOURCE_FILE}" -c -m -o "${OUTPUT_FILE}"`;

    try {
      execSync(command, { stdio: 'pipe' });
    } catch (error) {
      log('❌ Minification failed', 'red');
      log(error.message, 'red');
      process.exit(1);
    }

    // Check if output file was created
    if (!fs.existsSync(OUTPUT_FILE)) {
      log('❌ Failed to create minified file', 'red');
      process.exit(1);
    }

    // Step 3: Add version banner
    log('');
    log('📋 Step 3/3: Adding version banner...', 'blue');

    const version = generateVersion();
    const banner = `/*! AICW v${version} */`;
    const minified = fs.readFileSync(OUTPUT_FILE, 'utf8');
    fs.writeFileSync(OUTPUT_FILE, banner + minified);

    // Save version to file for deploy script
    fs.writeFileSync(VERSION_FILE, version);

    log(`   Version: ${version}`, 'gray');

    const outputSize = getFileSize(OUTPUT_FILE);
    const savings = ((1 - (parseFloat(outputSize) / parseFloat(sourceSizeBefore))) * 100).toFixed(1);

    log(`   Output: ${path.relative(process.cwd(), OUTPUT_FILE)} (${outputSize} KB)`, 'gray');
    log(`   Size reduction: ${savings}%`, 'green');


    log('');
    log(colors.gray + '─'.repeat(50) + colors.reset);
    log(`✅ Build complete! (v${version})`, 'green');
    log('');

  } catch (error) {
    log('\n❌ Build failed:', 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

// Run the script
main();
