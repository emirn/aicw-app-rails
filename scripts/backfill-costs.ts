#!/usr/bin/env npx tsx
/**
 * Backfill estimated costs on existing articles that have applied_actions but no costs.
 *
 * Usage:
 *   npx tsx scripts/backfill-costs.ts --dry-run              # Preview without writing
 *   npx tsx scripts/backfill-costs.ts --project legavima.com  # Filter to one project
 *   npx tsx scripts/backfill-costs.ts                         # Run the backfill
 */

import fs from "fs";
import path from "path";

// ----- CLI args -----
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const projectIdx = args.indexOf("--project");
const projectFilter = projectIdx !== -1 ? args[projectIdx + 1] : null;

// ----- Paths -----
const REPO_ROOT = path.resolve(__dirname, "..");
const ACTIONS_DIR = path.join(REPO_ROOT, "apps/sgen/config/actions");
const DATA_ROOT = path.resolve(REPO_ROOT, "../blogpostgen-data/data/projects");

// ----- Types -----
interface ActionConfig {
  local?: boolean;
  output_mode?: string;
  pricing?: {
    input_per_million: number;
    output_per_million: number;
    fixed_cost_per_call?: number;
  };
}

interface CostEntry {
  created_at: string;
  action: string;
  cost: number;
}

interface ArticleMeta {
  created_at?: string;
  applied_actions?: string[];
  costs?: CostEntry[];
  [key: string]: unknown;
}

// ----- Local actions (cost = $0) -----
const LOCAL_ACTIONS = new Set([
  "add_toc",
  "humanize_text_random",
  "render_diagrams",
  "validate_links",
  "verify_assets",
  "verify_links_and_sources",
  "website_info",
  "get_competitors",
  "generate_image_social",
]);

// generate_image_hero uses Recraft V3 — hardcoded cost
const IMAGE_HERO_COST = 0.04;

// ----- Load action configs + prompt sizes -----
interface ActionInfo {
  config: ActionConfig;
  promptTokens: number; // estimated from prompt.md byte size
}

function loadActions(): Map<string, ActionInfo> {
  const map = new Map<string, ActionInfo>();
  const dirs = fs.readdirSync(ACTIONS_DIR);
  for (const name of dirs) {
    const configPath = path.join(ACTIONS_DIR, name, "config.json");
    if (!fs.existsSync(configPath)) continue;
    const config: ActionConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    let promptTokens = 0;
    const promptPath = path.join(ACTIONS_DIR, name, "prompt.md");
    if (fs.existsSync(promptPath)) {
      const bytes = fs.statSync(promptPath).size;
      promptTokens = Math.ceil(bytes / 4); // ~4 bytes per token
    }

    map.set(name, { config, promptTokens });
  }
  return map;
}

// ----- Cost estimation -----
function estimateCost(
  actionName: string,
  actionInfo: ActionInfo | undefined,
  contentLength: number
): number {
  // Local actions → $0
  if (LOCAL_ACTIONS.has(actionName)) return 0;

  // Image hero → fixed rate
  if (actionName === "generate_image_hero") return IMAGE_HERO_COST;

  if (!actionInfo) return 0;
  const { config, promptTokens } = actionInfo;

  // Actions marked local in config → $0
  if (config.local) return 0;

  // Must have pricing to estimate
  if (!config.pricing) return 0;

  const contentTokens = Math.ceil(contentLength / 4);
  const inputTokens = promptTokens + contentTokens + 50; // overhead

  // Estimate output tokens by output_mode
  let outputTokens: number;
  const mode = config.output_mode || "text_replace_all";
  if (mode === "create_meta") {
    outputTokens = 200;
  } else if (mode.startsWith("insert_content")) {
    outputTokens = Math.ceil(contentTokens * 0.3);
  } else {
    // text_replace_all, text_replace → full content returned
    outputTokens = contentTokens;
  }

  const { input_per_million, output_per_million, fixed_cost_per_call } = config.pricing;
  const cost =
    (inputTokens * input_per_million + outputTokens * output_per_million) / 1_000_000 +
    (fixed_cost_per_call || 0);

  return Math.round(cost * 1_000_000) / 1_000_000; // round to 6 decimal places
}

// ----- Main -----
function main() {
  const actions = loadActions();
  console.log(`Loaded ${actions.size} action configs from ${ACTIONS_DIR}`);

  // Find all article index.json files (drafts + ready)
  const projectDirs = projectFilter
    ? [path.join(DATA_ROOT, projectFilter)]
    : fs.readdirSync(DATA_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(DATA_ROOT, d.name));

  const files: string[] = [];
  for (const projDir of projectDirs) {
    for (const sub of ["drafts", "ready"]) {
      const subDir = path.join(projDir, sub);
      if (!fs.existsSync(subDir)) continue;
      // Walk recursively for index.json files, skipping _history snapshots
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === "_history") continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name === "index.json") files.push(full);
        }
      };
      walk(subDir);
    }
  }
  console.log(`Found ${files.length} article index.json files${projectFilter ? ` for ${projectFilter}` : ""}`);
  let updatedCount = 0;
  let skippedHasCosts = 0;
  let skippedNoActions = 0;
  let totalEstimatedCost = 0;
  const perProject: Record<string, { count: number; cost: number }> = {};

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const meta: ArticleMeta = JSON.parse(raw);

    // Skip if no applied_actions
    if (!meta.applied_actions || meta.applied_actions.length === 0) {
      skippedNoActions++;
      continue;
    }

    // Skip if already has non-empty costs array
    if (meta.costs && meta.costs.length > 0) {
      skippedHasCosts++;
      continue;
    }

    // Read content.md for token estimation
    const contentPath = path.join(path.dirname(filePath), "content.md");
    let contentLength = 0;
    if (fs.existsSync(contentPath)) {
      contentLength = fs.statSync(contentPath).size;
    }

    // Build cost entries
    const timestamp = meta.created_at || new Date().toISOString();
    const costs: CostEntry[] = meta.applied_actions.map((actionName) => ({
      created_at: timestamp,
      action: actionName,
      cost: estimateCost(actionName, actions.get(actionName), contentLength),
    }));

    const articleCost = costs.reduce((sum, c) => sum + c.cost, 0);
    totalEstimatedCost += articleCost;

    // Track per-project stats
    const relPath = path.relative(DATA_ROOT, filePath);
    const projectName = relPath.split(path.sep)[0];
    if (!perProject[projectName]) perProject[projectName] = { count: 0, cost: 0 };
    perProject[projectName].count++;
    perProject[projectName].cost += articleCost;

    const articleSlug = path.basename(path.dirname(filePath));

    if (dryRun) {
      console.log(`  [DRY-RUN] ${projectName}/${articleSlug}: ${meta.applied_actions.length} actions → $${articleCost.toFixed(4)}`);
    } else {
      // Write back
      meta.costs = costs;
      fs.writeFileSync(filePath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
      console.log(`  Updated ${projectName}/${articleSlug}: ${meta.applied_actions.length} actions → $${articleCost.toFixed(4)}`);
    }

    updatedCount++;
  }

  // Summary
  console.log("\n--- Summary ---");
  console.log(`Articles updated: ${updatedCount}`);
  console.log(`Skipped (already has costs): ${skippedHasCosts}`);
  console.log(`Skipped (no applied_actions): ${skippedNoActions}`);
  console.log(`Total estimated cost: $${totalEstimatedCost.toFixed(2)}`);
  console.log("\nPer project:");
  for (const [proj, stats] of Object.entries(perProject).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${proj}: ${stats.count} articles, $${stats.cost.toFixed(2)}`);
  }

  if (dryRun) {
    console.log("\n(Dry run — no files were modified)");
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
