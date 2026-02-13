/**
 * Interactive Prompts
 *
 * Wizard-style prompts for CLI interactive mode.
 * Prompts for missing required arguments when -i flag is used.
 */

import * as readline from 'readline';
import { readdirSync, readFileSync } from 'fs';
import * as path from 'path';
import { USER_PROJECTS_DIR, getProjectPaths } from '../config/user-paths';
import { resolvePath, projectExists, getArticles, getSeedArticles, getPublishableArticles } from './path-resolver';
import { META_FILE } from '@blogpostgen/types';


/**
 * Create a readline interface for prompts
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr to keep stdout clean for JSON output
  });
}

/**
 * Prompt user for input
 */
async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface();

  return new Promise((resolve) => {
    const displayQuestion = defaultValue
      ? `${question} [${defaultValue}]: `
      : `${question}: `;

    rl.question(displayQuestion, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Prompt user for text input (exported for reuse)
 */
export async function promptInput(question: string, defaultValue?: string): Promise<string> {
  return prompt(question, defaultValue);
}

/**
 * Prompt for yes/no confirmation
 */
export async function confirm(question: string, defaultYes: boolean = true): Promise<boolean> {
  const defaultText = defaultYes ? 'Y/n' : 'y/N';
  const answer = await prompt(`${question} [${defaultText}]`);

  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Prompt for multiline text input (for pasting content)
 * Uses timeout-based completion to handle pasted content reliably
 * Also ends on two empty lines in a row or Ctrl+D
 */
export async function promptMultilineInput(instructions?: string): Promise<string | null> {
  const rl = createInterface();
  const lines: string[] = [];
  let inputTimeout: NodeJS.Timeout | null = null;
  let resolved = false;
  const COMPLETION_DELAY_MS = 500; // Wait 500ms after last input

  console.error('\n' + (instructions || 'Paste content, then press Enter twice when done:'));
  console.error('(Input will be captured 0.5s after pasting completes)');
  console.error('────────────────────────────────────────');

  return new Promise((resolve) => {
    const finishInput = () => {
      if (resolved) return;
      resolved = true;
      if (inputTimeout) clearTimeout(inputTimeout);
      rl.close();
      const content = lines.join('\n').trim();
      if (content) {
        console.error('────────────────────────────────────────');
        console.error(`Received ${content.length} characters, ${lines.length} lines\n`);
        resolve(content);
      } else {
        console.error('No content received.\n');
        resolve(null);
      }
    };

    rl.on('line', (line) => {
      // Clear any pending timeout
      if (inputTimeout) clearTimeout(inputTimeout);

      // Check for explicit end signal (two empty lines in a row)
      if (line === '' && lines.length > 0 && lines[lines.length - 1] === '') {
        finishInput();
        return;
      }

      lines.push(line);

      // Set timeout - if no more input for 500ms, we're done
      inputTimeout = setTimeout(finishInput, COMPLETION_DELAY_MS);
    });

    // Handle Ctrl+D (EOF)
    rl.on('close', () => {
      if (inputTimeout) clearTimeout(inputTimeout);
      finishInput();
    });
  });
}

/**
 * Prompt for plan import source (file or paste into terminal)
 * Returns flags object with either { file: path } or { paste: true }
 */
export async function promptPlanImportSource(): Promise<{ file?: string; paste?: boolean } | null> {
  console.error('\n=== Plan Import Source ===\n');
  console.error('  1. From file');
  console.error('  2. Paste into terminal');
  console.error('');

  const answer = await prompt('Enter choice (1 or 2, or q to quit)');

  if (!answer || answer.toLowerCase() === 'q') {
    return null;
  }

  const choice = parseInt(answer, 10);

  if (choice === 1) {
    const filePath = await prompt('Enter file path');
    if (!filePath) {
      console.error('No file path provided.');
      return null;
    }
    return { file: filePath };
  }

  if (choice === 2) {
    return { paste: true };
  }

  console.error('Invalid choice.');
  return null;
}

/**
 * Illustration style entry parsed from CSV
 */
interface IllustrationStyle {
  style_id: string;
  description: string;
  category: string; // base style extracted from style_id
}

/**
 * Load illustration styles from bundled CSV
 */
function loadIllustrationStyles(): IllustrationStyle[] {
  const csvPath = path.join(__dirname, '..', 'config', 'illustration-styles.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // skip header

  return lines
    .filter(line => line.trim())
    .map(line => {
      const commaIdx = line.indexOf(',');
      const style_id = line.slice(0, commaIdx).trim();
      const description = line.slice(commaIdx + 1).trim();
      const category = style_id.includes('/') ? style_id.split('/')[0] : style_id;
      return { style_id, description, category };
    });
}

/**
 * Interactive illustration style picker for project setup.
 * Shows styles grouped by category with numbered selection.
 * Returns selected style_id or null if skipped.
 */
export async function selectIllustrationStyle(): Promise<string | null> {
  const styles = loadIllustrationStyles();

  // Group by category
  const categories = ['digital_illustration', 'vector_illustration'];
  const categoryLabels: Record<string, string> = {
    digital_illustration: 'Digital Illustration',
    vector_illustration: 'Vector Illustration',
  };

  console.error('\n=== Select Illustration Style ===\n');

  const flatList: IllustrationStyle[] = [];
  let idx = 1;

  for (const cat of categories) {
    const catStyles = styles.filter(s => s.category === cat);
    if (catStyles.length === 0) continue;

    console.error(`  ${categoryLabels[cat] || cat}:`);
    for (const style of catStyles) {
      const isDefault = style.style_id === 'digital_illustration/pastel_gradient';
      const suffix = isDefault ? ' (default)' : '';
      console.error(`    ${String(idx).padStart(3)}. ${style.style_id.padEnd(45)} ${style.description}${suffix}`);
      flatList.push(style);
      idx++;
    }
    console.error('');
  }

  const answer = await prompt('Enter number, style ID, or press Enter for default', 'digital_illustration/pastel_gradient');

  if (!answer || answer === 'digital_illustration/pastel_gradient') {
    return 'digital_illustration/pastel_gradient';
  }

  // Check if it's a number
  const num = parseInt(answer, 10);
  if (!isNaN(num) && num >= 1 && num <= flatList.length) {
    return flatList[num - 1].style_id;
  }

  // Check if it matches a style_id directly
  const matched = styles.find(s => s.style_id === answer);
  if (matched) {
    return matched.style_id;
  }

  console.error(`Unknown style '${answer}', using default.`);
  return 'digital_illustration/pastel_gradient';
}

/**
 * Command-specific prompt configurations
 */
interface CommandPrompts {
  [key: string]: {
    prompts: {
      name: string;
      question: string;
      required?: boolean;
      default?: string;
      type?: 'string' | 'number' | 'boolean';
    }[];
  };
}

const COMMAND_PROMPTS: CommandPrompts = {
  'project-init': {
    prompts: [
      { name: 'name', question: 'Project name', required: true },
    ],
  },
  'project-reinit': {
    prompts: [
      { name: 'path', question: 'Project name', required: true },
    ],
  },
  'plan-import': {
    prompts: [
      { name: 'path', question: 'Project path', required: true },
      { name: 'file', question: 'File path containing content plan (or leave empty for clipboard)' },
      { name: 'clipboard', question: 'Read from clipboard instead?', type: 'boolean' },
    ],
  },
  'generate': {
    prompts: [
      { name: 'path', question: 'Project or article path', required: true },
      { name: 'limit', question: 'Max articles to generate (0 = all)', default: '0', type: 'number' },
    ],
  },
  // 'enhance' - now uses promptEnhancementMode() for pipeline selection
  'status': {
    prompts: [
      { name: 'path', question: 'Project or article path (leave empty for all projects)' },
    ],
  },
  'mark-reviewed': {
    prompts: [
      { name: 'path', question: 'Project or article path', required: true },
      { name: 'all', question: 'Mark all eligible articles?', type: 'boolean' },
    ],
  },
  'finalize': {
    prompts: [
      { name: 'path', question: 'Project or article path', required: true },
      { name: 'all', question: 'Finalize all eligible articles?', type: 'boolean' },
    ],
  },
  'article-seed': {
    prompts: [
      { name: 'path', question: 'Project path', required: true },
      { name: 'title', question: 'Article title', required: true },
      { name: 'slug', question: 'Article slug (optional, auto-generated from title)' },
      { name: 'keywords', question: 'Keywords (comma-separated, optional)' },
    ],
  },
};

/**
 * Fill in missing arguments interactively
 *
 * @param command - The command name
 * @param currentArgs - Current arguments (some may be missing)
 * @returns Updated arguments with user input
 */
export async function promptForMissingArgs(
  command: string,
  currentArgs: Record<string, any>
): Promise<Record<string, any>> {
  const config = COMMAND_PROMPTS[command];

  if (!config) {
    // Unknown command, return as-is
    return currentArgs;
  }

  const result = { ...currentArgs };

  console.error(`\n${command.toUpperCase()} - Interactive Mode\n`);

  for (const promptConfig of config.prompts) {
    // Skip if already provided
    if (result[promptConfig.name] !== undefined && result[promptConfig.name] !== '') {
      continue;
    }

    // Skip if not required and we're in a hurry
    if (!promptConfig.required && promptConfig.type !== 'boolean') {
      const answer = await prompt(promptConfig.question, promptConfig.default);
      if (answer) {
        result[promptConfig.name] = promptConfig.type === 'number' ? parseInt(answer, 10) : answer;
      }
    } else if (promptConfig.type === 'boolean') {
      result[promptConfig.name] = await confirm(promptConfig.question, false);
    } else {
      // Required field - keep prompting until we get a value
      let answer = '';
      while (!answer) {
        answer = await prompt(promptConfig.question, promptConfig.default);
        if (!answer && promptConfig.required) {
          console.error('This field is required.');
        }
      }
      result[promptConfig.name] = promptConfig.type === 'number' ? parseInt(answer, 10) : answer;
    }
  }

  console.error(''); // Empty line for spacing
  return result;
}

/**
 * Check if interactive mode should prompt for a command
 *
 * @param command - The command name
 * @param args - Current arguments
 * @returns true if prompts are needed
 */
export function needsInteractivePrompts(command: string, args: Record<string, any>): boolean {
  const config = COMMAND_PROMPTS[command];
  if (!config) return false;

  // Check if any required args are missing
  for (const promptConfig of config.prompts) {
    if (promptConfig.required && !args[promptConfig.name]) {
      return true;
    }
  }

  return false;
}

/**
 * Show command help/usage interactively with grouped display
 */
export async function showInteractiveHelp(
  commands: { name: string; description: string; usage: string; category?: string; group?: string }[],
  debugEnabled = false
): Promise<string | null> {
  const debugStatus = debugEnabled ? ' [DEBUG: ON]' : '';
  console.error(`\nAvailable commands:${debugStatus}\n`);

  // Group config: group name -> { baseNumber, title }
  const groupConfig: Record<string, { base: number; title: string }> = {
    project: { base: 1, title: 'Project' },
    utility: { base: 101, title: 'Utilities' },
    publish: { base: 201, title: 'Publishing' },
  };

  // Build number-to-command map for selection
  const numberMap = new Map<number, string>();

  // Display grouped local commands
  const groups = ['project', 'utility', 'publish'];
  for (const groupName of groups) {
    const groupCmds = commands.filter(c => c.group === groupName);
    if (groupCmds.length === 0) continue;

    const config = groupConfig[groupName];
    console.error(`  ${config.title}:`);

    groupCmds.forEach((cmd, i) => {
      const num = config.base + i;
      numberMap.set(num, cmd.name);
      console.error(`    ${String(num).padStart(3)}. ${cmd.name.padEnd(15)} - ${cmd.description}`);
    });
    console.error('');
  }

  // Display pipeline commands (from API) - use 301+ range
  const pipelineCmds = commands.filter(c => c.category === 'pipeline');
  if (pipelineCmds.length > 0) {
    console.error('  Pipelines:');
    pipelineCmds.forEach((cmd, i) => {
      const num = 301 + i;
      numberMap.set(num, cmd.name);
      console.error(`    ${String(num).padStart(3)}. ${cmd.name.padEnd(15)} - ${cmd.description}`);
    });
    console.error('');
  }

  console.error('  d. Toggle debug mode');
  console.error('');

  const choice = await prompt('Enter command number or name (d for debug, q to quit)');

  if (!choice || choice.toLowerCase() === 'q') {
    return null;
  }

  // Handle debug toggle
  if (choice.toLowerCase() === 'd' || choice.toLowerCase() === 'debug') {
    return 'd';
  }

  // Check if it's a number from our map
  const num = parseInt(choice, 10);
  if (!isNaN(num) && numberMap.has(num)) {
    return numberMap.get(num)!;
  }

  // Check if it matches a command name
  const matched = commands.find((c) => c.name === choice);
  return matched ? matched.name : null;
}

/**
 * Project info for selection
 */
export interface ProjectInfo {
  name: string;
  articleCount: number;
}

/**
 * List all available projects from USER_PROJECTS_DIR
 */
export async function listAvailableProjects(): Promise<ProjectInfo[]> {
  try {
    const entries = readdirSync(USER_PROJECTS_DIR, { withFileTypes: true });
    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const resolved = resolvePath(entry.name);
          if (await projectExists(resolved)) {
            // Get seed articles (no last_pipeline set - ready for generate)
            const articles = await getArticles(resolved);
            projects.push({
              name: entry.name,
              articleCount: articles.length,
            });
          }
        } catch {
          // Skip directories that aren't valid projects
        }
      }
    }

    // Sort by article count (descending) so projects with work to do are first
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      console.error(`\nPermission denied: Cannot access ${USER_PROJECTS_DIR}`);
      console.error('Fix: System Preferences → Privacy & Security → Files and Folders → Enable for your terminal\n');
    }
    return [];
  }
}

/**
 * Simple numbered project selector
 * Returns selected project name or null if cancelled
 */
/** Special return value indicating user wants to create a new project */
export const CREATE_NEW_PROJECT = '__CREATE_NEW__';

export async function selectProject(): Promise<string | null> {
  const projects = await listAvailableProjects();

  if (projects.length === 0) {
    console.error('\nNo projects found.\n');
    console.error('Would you like to create a new project?');
    console.error('');

    const answer = await prompt('Create new project? (Y/n)');
    if (!answer || answer.toLowerCase() !== 'n') {
      return CREATE_NEW_PROJECT;
    }
    return null;
  }

  console.error('\n=== Select Project ===\n');
  console.error('  0. [Create new project]');
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const paths = getProjectPaths(p.name);
    console.error(`  ${i + 1}. ${p.name} (${p.articleCount} articles)`);
    console.error(`     ${paths.root}`);
  }
  console.error('');

  const answer = await prompt('Enter project number (or q to quit)');

  if (!answer || answer.toLowerCase() === 'q') {
    return null;
  }

  const num = parseInt(answer, 10);
  if (num === 0) {
    return CREATE_NEW_PROJECT;
  }
  if (!isNaN(num) && num >= 1 && num <= projects.length) {
    return projects[num - 1].name;
  }

  console.error('Invalid selection.');
  return null;
}

/**
 * Article info for selection picker
 */
export interface ArticleForSelection {
  path: string;
  title: string;
  created_at: string;
  priority?: number;
}

/**
 * Helper to format date for display
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

/**
 * Helper to get priority indicator
 */
function getPriorityIndicator(priority?: number): string {
  if (priority === 1) return '[!]';
  if (priority === 3) return '[ ]';
  return '[-]';
}

/**
 * Helper to truncate title
 */
function truncateTitle(title: string, maxLen: number = 50): string {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen - 3) + '...';
}

const MAX_TITLE_LENGTH = 200;
const MAX_OLDEST_ARTICLES_TO_SHOW = 10;

/**
 * Result of parsing article selection input
 */
interface SelectionResult {
  type: 'all' | 'indices' | 'quit';
  indices?: number[];  // 0-based indices into sorted array
  warning?: string;    // Warning message (e.g., truncation)
}

/**
 * Extract keyword filters (date:, url:) from input string.
 * Returns the base command (range/number/all) with filters removed.
 */
function extractFilters(input: string): {
  baseInput: string;
  dateFilter?: string;
  urlFilter?: string;
} {
  let dateFilter: string | undefined;
  let urlFilter: string | undefined;

  // Extract date:YYYY-MM-DD
  const dateMatch = input.match(/\bdate:(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) dateFilter = dateMatch[1];

  // Extract url:PATTERN (everything until next space or end)
  const urlMatch = input.match(/\burl:(\S+)/);
  if (urlMatch) urlFilter = urlMatch[1];

  // Remove filters from input to get base command
  const baseInput = input
    .replace(/\bdate:\d{4}-\d{2}-\d{2}\b/, '')
    .replace(/\burl:\S+/, '')
    .trim();

  return { baseInput, dateFilter, urlFilter };
}

/**
 * Apply date and url filters to article list.
 * Returns a working list with original indices preserved.
 */
function applyFilters(
  articles: ArticleForSelection[] | undefined,
  totalArticles: number,
  dateFilter?: string,
  urlFilter?: string
): { workingList: { originalIndex: number; article: ArticleForSelection }[]; indices: number[]; warning?: string } {
  let workingList = articles
    ? articles.map((article, idx) => ({ originalIndex: idx, article }))
    : Array.from({ length: totalArticles }, (_, idx) => ({ originalIndex: idx, article: null as any }));

  const warnings: string[] = [];

  if (dateFilter && articles) {
    const maxDate = new Date(dateFilter + 'T23:59:59Z');
    workingList = workingList.filter(item => new Date(item.article.created_at) <= maxDate);
    warnings.push(`Date filter: ${workingList.length} articles with created_at <= ${dateFilter}`);
  }

  if (urlFilter && articles) {
    workingList = workingList.filter(item => item.article.path.includes(urlFilter));
    warnings.push(`URL filter: ${workingList.length} articles matching path "${urlFilter}"`);
  }

  return {
    workingList,
    indices: workingList.map(item => item.originalIndex),
    warning: warnings.length > 0 ? warnings.join('; ') : undefined,
  };
}

/**
 * Slice a range from filtered results.
 * startNum is 1-based, count is number of items to take.
 */
function sliceRange(
  filtered: { workingList: { originalIndex: number }[]; warning?: string },
  startNum: number,
  count: number
): SelectionResult {
  const effectiveTotal = filtered.workingList.length;

  if (effectiveTotal === 0) {
    return { type: 'indices', indices: [], warning: filtered.warning || 'No articles match filters' };
  }

  if (startNum < 1 || startNum > effectiveTotal) {
    return {
      type: 'indices',
      indices: [],
      warning: `${filtered.warning ? filtered.warning + '; ' : ''}Start index ${startNum} is out of range (1-${effectiveTotal})`,
    };
  }

  if (count === 0) {
    return { type: 'indices', indices: [] };
  }

  const startIdx = startNum - 1;
  const actualEnd = Math.min(startIdx + count, effectiveTotal);
  const indices = filtered.workingList.slice(startIdx, actualEnd).map(item => item.originalIndex);

  let warning = filtered.warning;
  if (startIdx + count > effectiveTotal) {
    const truncMsg = `Requested ${count} from ${startNum}, only ${actualEnd - startIdx} available`;
    warning = warning ? `${warning}; ${truncMsg}` : truncMsg;
  }

  return { type: 'indices', indices, warning };
}

/**
 * Parse article selection input.
 * Supports: comma-separated numbers, range "N:M", keyword filters "date:YYYY-MM-DD url:path/",
 * "all", single number with filters, and "q" to quit.
 *
 * @param input - User input string
 * @param totalArticles - Total number of available articles
 * @param articles - Optional array of articles for filtering
 * @returns SelectionResult with type and indices
 */
export function parseArticleSelection(
  input: string,
  totalArticles: number,
  articles?: ArticleForSelection[]
): SelectionResult {
  const trimmed = input.trim();

  // Quit
  if (!trimmed || trimmed.toLowerCase() === 'q') {
    return { type: 'quit' };
  }

  // Extract keyword filters: date:YYYY-MM-DD and url:PATTERN
  const { baseInput, dateFilter, urlFilter } = extractFilters(trimmed);
  const baseLower = baseInput.toLowerCase();

  // All (with optional filters)
  if (baseLower === 'all') {
    if (!dateFilter && !urlFilter) {
      return { type: 'all' };
    }
    const filtered = applyFilters(articles, totalArticles, dateFilter, urlFilter);
    return { type: 'indices', indices: filtered.indices, warning: filtered.warning };
  }

  // Range syntax: N:M (with optional keyword filters)
  const rangeMatch = baseLower.match(/^(\d+):(\d+)$/);
  if (rangeMatch) {
    const startNum = parseInt(rangeMatch[1], 10);
    const count = parseInt(rangeMatch[2], 10);
    const filtered = applyFilters(articles, totalArticles, dateFilter, urlFilter);
    return sliceRange(filtered, startNum, count);
  }

  // Single number with filters: N date:... url:...
  const singleMatch = baseLower.match(/^(\d+)$/);
  if (singleMatch && (dateFilter || urlFilter)) {
    const num = parseInt(singleMatch[1], 10);
    const filtered = applyFilters(articles, totalArticles, dateFilter, urlFilter);
    return sliceRange(filtered, num, 1);
  }

  // Comma-separated numbers (existing behavior, no filter support)
  const indices: number[] = [];
  const nums = baseLower.split(',').map((s) => parseInt(s.trim(), 10));

  for (const num of nums) {
    if (!isNaN(num) && num >= 1 && num <= totalArticles) {
      indices.push(num - 1);
    }
  }

  return { type: 'indices', indices };
}

/**
 * Simple numbered article selector
 * Shows max 10 oldest articles with numbers
 * Supports: comma-separated numbers, range syntax "N:M", "all", "q"
 *
 * @param articles - Array of articles with path, title, created_at, priority
 * @returns Array of selected article paths
 */
export async function selectArticlesForGeneration(
  articles: ArticleForSelection[]
): Promise<string[]> {
  if (articles.length === 0) {
    console.error('\nNo articles available.\n');
    return [];
  }

  // Sort by created_at (oldest first) - FULL list for selection
  const sorted = [...articles]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Display subset (max 10)
  const displayArticles = sorted.slice(0, MAX_OLDEST_ARTICLES_TO_SHOW);
  const displayCount = Math.min(sorted.length, MAX_OLDEST_ARTICLES_TO_SHOW);

  console.error(`\n=== Articles Ready to Generate (${displayCount} of ${sorted.length}) ===\n`);

  for (let i = 0; i < displayArticles.length; i++) {
    const article = displayArticles[i];
    const priority = getPriorityIndicator(article.priority);
    const date = formatDate(article.created_at);
    const title = truncateTitle(article.title, MAX_TITLE_LENGTH);
    console.error(`  ${String(i + 1).padStart(2)}. ${priority} ${date.padEnd(14)} ${title}`);
  }

  if (sorted.length > MAX_OLDEST_ARTICLES_TO_SHOW) {
    const remaining = sorted.length - MAX_OLDEST_ARTICLES_TO_SHOW;
    const nextStart = MAX_OLDEST_ARTICLES_TO_SHOW + 1;
    console.error(`\n  ... and ${remaining} more (use '${nextStart}:10', or add filters: 'date:YYYY-MM-DD', 'url:path/')`);
  }
  console.error('');

  while (true) {
    const answer = await prompt("Enter numbers (e.g., '1,3,5'), range 'N:M', filters 'date:YYYY-MM-DD url:path/', 'all', or 'q'");

    const result = parseArticleSelection(answer, sorted.length, sorted);

    if (result.warning) {
      console.error(`  ${result.warning}`);
    }

    if (result.type === 'quit') {
      return [];
    }

    // Resolve selected paths
    let selectedPaths: string[];
    if (result.type === 'all') {
      selectedPaths = sorted.map(a => a.path);
    } else {
      selectedPaths = (result.indices || []).map(idx => sorted[idx].path);
    }

    if (selectedPaths.length === 0) {
      console.error('\nNo articles matched. Try again.\n');
      continue;
    }

    // Show selected articles for confirmation
    console.error(`\n  Selected ${selectedPaths.length} article(s):`);
    for (let i = 0; i < selectedPaths.length; i++) {
      const idx = result.type === 'all' ? i : result.indices![i];
      const a = sorted[idx];
      const date = formatDate(a.created_at);
      const title = truncateTitle(a.title, MAX_TITLE_LENGTH);
      console.error(`    ${String(i + 1).padStart(3)}. ${date.padEnd(14)} ${title}`);
    }
    console.error('');

    const confirmAnswer = await prompt('Proceed? (Y/n)');
    if (!confirmAnswer || confirmAnswer.trim().toLowerCase() === 'y' || confirmAnswer.trim() === '') {
      return selectedPaths;
    }
    // User typed something else → loop back
    console.error('');
  }
}

/**
 * Select articles ready for enhancement
 * Shows oldest articles first (by created_at)
 * Supports: comma-separated numbers, range syntax "N:M", "all", "q"
 *
 * @param articles - Pre-filtered list of articles eligible for the pipeline
 * @returns Array of selected article paths, or null if cancelled
 */
export async function selectArticlesForEnhancement(
  articles: ArticleForSelection[]
): Promise<string[] | null> {
  if (articles.length === 0) {
    return null;
  }

  // Display subset (max 10)
  const displayArticles = articles.slice(0, MAX_OLDEST_ARTICLES_TO_SHOW);
  const displayCount = Math.min(articles.length, MAX_OLDEST_ARTICLES_TO_SHOW);

  console.error(`\n=== Articles Ready to Enhance (${displayCount} of ${articles.length}) ===\n`);

  for (let i = 0; i < displayArticles.length; i++) {
    const article = displayArticles[i];
    const date = article.created_at ? formatDate(article.created_at) : 'Unknown';
    const title = truncateTitle(article.title || article.path, MAX_TITLE_LENGTH);
    console.error(`  ${String(i + 1).padStart(2)}. ${date.padEnd(14)} ${title}`);
  }

  if (articles.length > MAX_OLDEST_ARTICLES_TO_SHOW) {
    const remaining = articles.length - MAX_OLDEST_ARTICLES_TO_SHOW;
    const nextStart = MAX_OLDEST_ARTICLES_TO_SHOW + 1;
    console.error(`\n  ... and ${remaining} more (use '${nextStart}:10', or add filters: 'date:YYYY-MM-DD', 'url:path/')`);
  }
  console.error('');

  while (true) {
    const answer = await prompt("Enter numbers (e.g., '1,3,5'), range 'N:M', filters 'date:YYYY-MM-DD url:path/', 'all', or 'q'");

    const result = parseArticleSelection(answer, articles.length, articles);

    if (result.warning) {
      console.error(`  ${result.warning}`);
    }

    if (result.type === 'quit') {
      return null;
    }

    // Resolve selected paths
    let selectedPaths: string[];
    if (result.type === 'all') {
      selectedPaths = articles.map(a => a.path);
    } else {
      selectedPaths = (result.indices || []).map(idx => articles[idx].path);
    }

    if (selectedPaths.length === 0) {
      console.error('\nNo articles matched. Try again.\n');
      continue;
    }

    // Show selected articles for confirmation
    console.error(`\n  Selected ${selectedPaths.length} article(s):`);
    for (let i = 0; i < selectedPaths.length; i++) {
      const idx = result.type === 'all' ? i : result.indices![i];
      const a = articles[idx];
      const date = a.created_at ? formatDate(a.created_at) : 'Unknown';
      const title = truncateTitle(a.title || a.path, MAX_TITLE_LENGTH);
      console.error(`    ${String(i + 1).padStart(3)}. ${date.padEnd(14)} ${title}`);
    }
    console.error('');

    const confirmAnswer = await prompt('Proceed? (Y/n)');
    if (!confirmAnswer || confirmAnswer.trim().toLowerCase() === 'y' || confirmAnswer.trim() === '') {
      return selectedPaths;
    }
    // User typed something else → loop back
    console.error('');
  }
}

/**
 * Action metadata returned from sgen API
 */
interface ActionInfo {
  name: string;
  description: string;
  forcible: boolean;
  output_mode?: string;
  no_ai?: boolean;
}

/**
 * Cache for fetched actions (avoid repeated API calls)
 */
let cachedActions: ActionInfo[] | null = null;

/**
 * Fetch all actions from sgen API
 * @param baseUrl - Sgen API base URL
 * @returns Array of action metadata
 */
async function fetchActions(baseUrl: string): Promise<ActionInfo[]> {
  if (cachedActions) {
    return cachedActions;
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/actions`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json() as { success: boolean; actions: ActionInfo[] };
    if (data.success && Array.isArray(data.actions)) {
      cachedActions = data.actions;
      return cachedActions;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error(`Warning: Could not fetch actions from API: ${error instanceof Error ? error.message : String(error)}`);
    // Return empty array on error - caller should handle gracefully
    return [];
  }
}

/**
 * Get forcible actions (actions that can be used in force-enhance workflow)
 * @param baseUrl - Sgen API base URL
 * @returns Array of forcible action metadata
 */
async function getForcibleActions(baseUrl: string): Promise<ActionInfo[]> {
  const actions = await fetchActions(baseUrl);
  return actions.filter(a => a.forcible);
}

/**
 * Select publishable articles and action for force-enhance workflow.
 * This allows re-running enhancement actions on articles that have already
 * completed the enhance pipeline.
 *
 * @param projectName - Name of the project
 * @param baseUrl - Sgen API base URL for fetching available actions
 * @returns Object with selected article paths and action, or null if cancelled
 */
export async function selectArticlesForForceEnhance(
  projectName: string,
  baseUrl: string
): Promise<{ articlePaths: string[]; action: string } | null> {
  // Get publishable articles from drafts/ folder (last_pipeline starts with 'enhance')
  const publishableArticles = await getPublishableArticles(projectName);

  if (publishableArticles.length === 0) {
    console.error('\nNo enhanced articles found.\n');
    console.error('Force-enhance is for re-running actions on articles with last_pipeline starting with "enhance".');
    return null;
  }

  // Fetch forcible actions from API
  const forcibleActions = await getForcibleActions(baseUrl);
  if (forcibleActions.length === 0) {
    console.error('\nNo forcible actions available. Check API connection.\n');
    return null;
  }

  // Sort by updated_at (most recently updated first for force-enhance)
  const sorted = [...publishableArticles]
    .sort((a, b) => {
      const dateA = a.meta.updated_at ? new Date(a.meta.updated_at).getTime() : 0;
      const dateB = b.meta.updated_at ? new Date(b.meta.updated_at).getTime() : 0;
      return dateB - dateA; // Most recent first
    });

  // Display articles
  const displayArticles = sorted.slice(0, MAX_OLDEST_ARTICLES_TO_SHOW);
  const displayCount = Math.min(sorted.length, MAX_OLDEST_ARTICLES_TO_SHOW);

  console.error(`\n=== Enhanced Articles for Force-Enhance (${displayCount} of ${sorted.length}) ===\n`);

  for (let i = 0; i < displayArticles.length; i++) {
    const article = displayArticles[i];
    const date = article.meta.updated_at ? formatDate(article.meta.updated_at) : 'Unknown';
    const title = truncateTitle(article.meta.title || article.path, MAX_TITLE_LENGTH);
    const appliedCount = article.meta.applied_actions?.length || 0;
    console.error(`  ${String(i + 1).padStart(2)}. ${date.padEnd(14)} ${title} (${appliedCount} actions)`);
  }

  if (sorted.length > MAX_OLDEST_ARTICLES_TO_SHOW) {
    const remaining = sorted.length - MAX_OLDEST_ARTICLES_TO_SHOW;
    const nextStart = MAX_OLDEST_ARTICLES_TO_SHOW + 1;
    console.error(`\n  ... and ${remaining} more (use range syntax, e.g., '${nextStart}:10', or filter 'all url:blog/')`);
  }
  console.error('');

  // Build selection list for filter support
  const selectionList: ArticleForSelection[] = sorted.map(a => ({
    path: a.path,
    title: a.meta.title || a.path,
    created_at: a.meta.created_at || new Date().toISOString(),
  }));

  // Step 1: Select articles (with confirmation loop)
  let selectedPaths: string[];

  while (true) {
    const answer = await prompt("Enter numbers (e.g., '1,3,5'), range 'N:M', filters 'date:YYYY-MM-DD url:path/', 'all', or 'q'");
    const result = parseArticleSelection(answer, sorted.length, selectionList);

    if (result.warning) {
      console.error(`  ${result.warning}`);
    }

    if (result.type === 'quit') {
      return null;
    }

    if (result.type === 'all') {
      selectedPaths = sorted.map((a) => a.path);
    } else {
      selectedPaths = (result.indices || []).map((idx) => sorted[idx].path);
    }

    if (selectedPaths.length === 0) {
      console.error('\nNo articles matched. Try again.\n');
      continue;
    }

    // Show selected articles for confirmation
    console.error(`\n  Selected ${selectedPaths.length} article(s):`);
    for (let i = 0; i < selectedPaths.length; i++) {
      const idx = result.type === 'all' ? i : result.indices![i];
      const a = sorted[idx];
      const date = a.meta.updated_at ? formatDate(a.meta.updated_at) : 'Unknown';
      const title = truncateTitle(a.meta.title || a.path, MAX_TITLE_LENGTH);
      console.error(`    ${String(i + 1).padStart(3)}. ${date.padEnd(14)} ${title}`);
    }
    console.error('');

    const confirmAnswer = await prompt('Proceed? (Y/n)');
    if (!confirmAnswer || confirmAnswer.trim().toLowerCase() === 'y' || confirmAnswer.trim() === '') {
      break;
    }
    // User typed something else → loop back
    console.error('');
  }

  // Step 2: Select action to apply
  console.error(`\n=== Select Action to Apply (${forcibleActions.length} available) ===\n`);

  for (let i = 0; i < forcibleActions.length; i++) {
    const action = forcibleActions[i];
    console.error(`  ${String(i + 1).padStart(2)}. ${action.name.padEnd(24)} - ${action.description}`);
  }
  console.error('');

  const actionAnswer = await prompt("Select action number or 'q'");

  if (actionAnswer.toLowerCase() === 'q') {
    return null;
  }

  const actionIndex = parseInt(actionAnswer, 10) - 1;
  if (isNaN(actionIndex) || actionIndex < 0 || actionIndex >= forcibleActions.length) {
    console.error('Invalid action selection.');
    return null;
  }

  const selectedAction = forcibleActions[actionIndex].name;

  return { articlePaths: selectedPaths, action: selectedAction };
}

/**
 * Wait for user to press Enter before continuing
 */
export async function pressEnterToContinue(message?: string): Promise<void> {
  const rl = createInterface();
  return new Promise((resolve) => {
    rl.question(message || '\nPress Enter to continue...', () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Prompt with editable default value
 * Shows default pre-filled, user can press Enter to accept or edit then Enter
 */
export async function promptWithDefault(
  label: string,
  defaultValue: string
): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });

  return new Promise((resolve) => {
    // Write the prompt with default value pre-filled
    rl.question(`${label} `, (answer) => {
      rl.close();
      // If user just pressed Enter, use the default
      resolve(answer.trim() || defaultValue);
    });

    // Pre-fill the line with default value (user can edit)
    rl.write(defaultValue);
  });
}

/**
 * Generate suggested slug for conflict resolution
 * Appends -2, -3, etc. based on existing suffix
 */
function suggestNewSlug(originalSlug: string): string {
  // Check if already ends with -N
  const match = originalSlug.match(/-(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return originalSlug.replace(/-\d+$/, `-${num + 1}`);
  }
  return `${originalSlug}-2`;
}

/**
 * Resolve conflicts interactively - show editable slug
 * User presses Enter to accept suggested slug or edits then presses Enter
 * Type 's' to skip the article
 */
export async function resolveConflictsInteractive(
  conflicts: Array<{
    title: string;
    articlePath: string;
    conflict: 'seed_replace' | 'skip';
    existingPipeline?: string;
  }>
): Promise<Map<string, string | 'skip'>> {
  const resolved = new Map<string, string | 'skip'>();

  console.error('\n=== Resolve Conflicts ===\n');

  for (const item of conflicts) {
    const status =
      item.conflict === 'seed_replace'
        ? 'exists (seed)'
        : `exists (at '${item.existingPipeline}')`;

    console.error(`"${item.title}"`);
    console.error(`  ${status}`);

    // Suggest modified slug
    const suggestedSlug = suggestNewSlug(item.articlePath);

    // Show editable prompt with suggested value
    const newSlug = await promptWithDefault(
      '  New URL (Enter to accept, or edit, or "s" to skip):',
      suggestedSlug
    );

    if (newSlug === 's' || newSlug === 'skip') {
      resolved.set(item.articlePath, 'skip');
      console.error('  → Skipped\n');
    } else {
      resolved.set(item.articlePath, newSlug);
      console.error(`  → Will create: ${newSlug}\n`);
    }
  }

  return resolved;
}

/**
 * Numbered option picker.
 * Returns 0-based index of selected option, or null if cancelled.
 */
export async function selectOption(question: string, options: string[]): Promise<number | null> {
  console.error(`\n${question}\n`);
  for (let i = 0; i < options.length; i++) {
    console.error(`  ${i + 1}) ${options[i]}`);
  }
  console.error('');

  const answer = await prompt('Enter choice');

  if (!answer || answer.toLowerCase() === 'q') {
    return null;
  }

  const num = parseInt(answer, 10);
  if (!isNaN(num) && num >= 1 && num <= options.length) {
    return num - 1;
  }

  console.error('Invalid selection.');
  return null;
}

/**
 * Prompt for website type (full website with hero vs blog-only)
 * Returns hero config, optional sections, and isBlogOnly flag.
 */
export async function promptWebsiteType(): Promise<{
  hero: { enabled: boolean };
  sections?: Array<Record<string, unknown>>;
  isBlogOnly: boolean;
}> {
  const choice = await selectOption('What type of website is this?', [
    'Blog-only (all articles at root, e.g. example.com/article-name)',
    'Full website (articles under /blog/, custom pages at root)',
  ]);

  if (choice === 1) {
    // Start with default blog section
    const sections: Array<Record<string, unknown>> = [{
      id: 'blog', label: 'Blog', path: 'blog',
      showInNav: true, showOnHome: true, sectionTitle: 'BLOG', layout: 'grid',
    }];

    // Loop: ask to add more sections
    let addMore = await confirm('Add another section (e.g. "Tools", "Reviews")?', false);
    while (addMore) {
      const label = await promptInput('Section label (e.g. "AI Tools")');
      if (label) {
        const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        sections.push({
          id, label, path: id,
          showInNav: true, showOnHome: true,
          sectionTitle: label.toUpperCase(), layout: 'grid',
        });
      }
      addMore = await confirm('Add another section?', false);
    }

    return { hero: { enabled: true }, sections, isBlogOnly: false };
  }
  // Default: blog-only
  return { hero: { enabled: false }, isBlogOnly: true };
}

/**
 * Prompt for legal pages configuration.
 * Returns footerLegalColumn config or null if skipped.
 */
export async function promptLegalPages(): Promise<Record<string, unknown> | null> {
  const choice = await selectOption('Legal pages setup:', [
    'Standard pages (/privacy/, /terms/)',
    'External URLs (enter custom links)',
    'Skip (no legal pages)',
  ]);

  if (choice === 0) {
    return {
      label: 'Legal',
      links: [
        { label: 'Privacy Policy', href: '/privacy/' },
        { label: 'Terms of Service', href: '/terms/' },
      ],
    };
  }

  if (choice === 1) {
    const privacyUrl = await prompt('Privacy Policy URL', 'INSERT-LINK-HERE');
    const termsUrl = await prompt('Terms of Service URL', 'INSERT-LINK-HERE');
    return {
      label: 'Legal',
      links: [
        { label: 'Privacy Policy', href: privacyUrl || 'INSERT-LINK-HERE' },
        { label: 'Terms of Service', href: termsUrl || 'INSERT-LINK-HERE' },
      ],
    };
  }

  // Skip
  return null;
}

/**
 * Prompt for CTA button in header.
 * Returns ctaButton config, navLink, and footerLink objects or null.
 */
export async function promptCtaButton(): Promise<{
  ctaButton: { label: string; href: string };
  navLink: { label: string; href: string };
  footerLink: { label: string; href: string };
} | null> {
  const addCta = await confirm('Add a Contact Us button in the header?', false);
  if (!addCta) return null;

  const label = await prompt('Button label', 'Contact Us');
  const href = await prompt('Button URL', 'INSERT-LINK-HERE');
  const finalLabel = label || 'Contact Us';
  const finalHref = href || 'INSERT-LINK-HERE';

  return {
    ctaButton: { label: finalLabel, href: finalHref },
    navLink: { label: finalLabel, href: finalHref },
    footerLink: { label: finalLabel, href: finalHref },
  };
}

/**
 * Prompt for local publishing setup.
 * Returns publish config or null if skipped.
 */
export async function promptLocalPublishing(
  projectName: string
): Promise<{
  enabled: boolean;
  path: string;
  content_subfolder: string;
  assets_subfolder: string;
  templatePath: string;
} | null> {
  const setup = await confirm('Set up local publishing with template?', true);
  if (!setup) return null;

  // Suggest path based on project name
  const suggestedPath = projectName.includes('.')
    ? path.resolve(USER_PROJECTS_DIR, '..', '..', 'sites', projectName)
    : '';

  const publishPath = await prompt(
    'Output directory (absolute path to site folder)',
    suggestedPath
  );

  if (!publishPath) return null;

  // Resolve default template path (env var takes priority, fallback to relative from CLI)
  const defaultTemplatePath = process.env.AICW_WB_TEMPLATE_PATH ||
    path.resolve(__dirname, '..', '..', '..', '..', 'apps', 'wbuilder', 'templates', 'default');

  return {
    enabled: true,
    path: publishPath,
    content_subfolder: 'src/content/articles',
    assets_subfolder: 'public/assets',
    templatePath: defaultTemplatePath,
  };
}

/**
 * Allowed MIME types for logo images
 */
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/**
 * Allowed MIME types for favicon/icon images
 */
const ICON_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Read a local file and return as data URI (base64 encoded).
 */
function readFileAsDataUri(filePath: string, allowedTypes: Record<string, string>): string | null {
  try {
    const resolvedPath = path.resolve(filePath);
    const buffer = readFileSync(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeType = allowedTypes[ext];
    if (!mimeType) {
      console.error(`Unsupported format: ${ext}. Allowed: ${Object.keys(allowedTypes).join(', ')}`);
      return null;
    }
    const base64 = buffer.toString('base64');
    console.error(`  Read ${buffer.length} bytes from ${resolvedPath}`);
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Fetch a URL and return as data URI (base64 encoded).
 */
async function fetchUrlAsDataUri(url: string, allowedTypes: Record<string, string>): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch: HTTP ${response.status}`);
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    const mimeType = Object.values(allowedTypes).find(t => contentType.includes(t));
    if (!mimeType) {
      console.error(`Unsupported content type: ${contentType}. Expected: ${Object.values(allowedTypes).join(', ')}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');
    console.error(`  Downloaded ${buffer.length} bytes from URL`);
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error(`Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Logo style presets for manual selection
 */
const LOGO_STYLES = [
  { id: 'plain', label: 'Plain', desc: 'Clean text, no decoration' },
  { id: 'border', label: 'Border', desc: 'Text inside a rounded border box' },
  { id: 'pill', label: 'Pill', desc: 'Text on colored pill/capsule background' },
  { id: 'underline', label: 'Underline', desc: 'Text with colored bottom border' },
  { id: 'highlight', label: 'Highlight', desc: 'Text on colored rectangle background' },
  { id: 'monogram-circle', label: 'Monogram', desc: 'Letter(s) in colored circle + name' },
  { id: 'slash', label: 'Slash', desc: 'First letter + colored "/" + rest of name' },
  { id: 'backdrop', label: 'Backdrop', desc: 'Text on subtle colored rounded rectangle' },
] as const;

/**
 * Prompt for logo style override after AI branding.
 * Returns updated logo config or null if user keeps generated.
 */
export async function promptLogoStyleOverride(currentLogo: any): Promise<any | null> {
  const choice = await selectOption('Logo style:', [
    `Keep generated (${currentLogo?.style || 'plain'})`,
    'Pick a different style',
  ]);

  if (choice === null || choice === 0) {
    return null; // Keep as-is
  }

  if (choice === 1) {
    return promptLogoStyle(currentLogo);
  }

  return null;
}

/**
 * Interactive logo style picker.
 * Shows 8 style presets with numbered selection.
 */
export async function promptLogoStyle(currentLogo: any): Promise<any | null> {
  console.error('\n=== Select Logo Style ===\n');

  for (let i = 0; i < LOGO_STYLES.length; i++) {
    const style = LOGO_STYLES[i];
    const current = currentLogo?.style === style.id ? ' (current)' : '';
    console.error(`  ${String(i + 1).padStart(2)}. ${style.label.padEnd(12)} ${style.desc}${current}`);
  }
  console.error('');

  const answer = await prompt('Enter number (or q to cancel)');

  if (!answer || answer.toLowerCase() === 'q') {
    return null;
  }

  const num = parseInt(answer, 10);
  if (!isNaN(num) && num >= 1 && num <= LOGO_STYLES.length) {
    const selected = LOGO_STYLES[num - 1];
    return { ...currentLogo, style: selected.id };
  }

  console.error('Invalid selection.');
  return null;
}

/**
 * Prompt for logo image file or URL.
 * Returns logo config with type: 'image', or null if declined.
 */
export async function promptLogoImage(): Promise<any | null> {
  const hasLogo = await confirm('Do you have a logo image file?', false);
  if (!hasLogo) return null;

  const input = await prompt('Enter image file path or URL (PNG/SVG/JPEG)');
  if (!input || input.toLowerCase() === 'q') return null;

  // URL — return directly (templates render <img src=...>)
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return { type: 'image', image_url: input, text: '' };
  }

  // File path → base64 data URI
  const dataUri = readFileAsDataUri(input, IMAGE_TYPES);
  if (!dataUri) return null;
  return { type: 'image', image_url: dataUri, text: '' };
}

/**
 * Prompt for favicon/icon image file or URL.
 * Asks if the user has a custom favicon, then reads/base64-encodes it.
 * URLs are downloaded and converted to base64 (template only handles data URIs).
 * Returns a data URI string, or null if declined.
 */
export async function promptFaviconImage(): Promise<string | null> {
  const hasIcon = await confirm('Do you have a website icon/favicon image?', false);
  if (!hasIcon) {
    console.error('  (An icon will be auto-generated from your logo at build time)');
    return null;
  }

  const input = await prompt('Enter icon file path or URL (PNG/SVG, ideally square)');
  if (!input || input.toLowerCase() === 'q') return null;

  // URL → download and convert to base64 (template only handles data URIs)
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return fetchUrlAsDataUri(input, ICON_TYPES);
  }

  // File path → base64 data URI
  return readFileAsDataUri(input, ICON_TYPES);
}

/**
 * Orchestrate all website config prompts.
 * Returns templateSettings, localPublish config, and isBlogOnly flag.
 */
export async function promptWebsiteConfig(projectName: string): Promise<{
  templateSettings: Record<string, unknown>;
  localPublish: {
    enabled: boolean;
    path: string;
    content_subfolder: string;
    assets_subfolder: string;
    templatePath: string;
  } | null;
  isBlogOnly: boolean;
}> {
  const websiteType = await promptWebsiteType();
  const legalPages = await promptLegalPages();
  const ctaResult = await promptCtaButton();
  const localPublish = await promptLocalPublishing(projectName);

  // Nav links depend on website type
  const navLinks: Array<{ label: string; href: string }> = [];
  if (websiteType.isBlogOnly) {
    // Blog-only: just Home link (home IS the blog)
    navLinks.push({ label: 'Home', href: '/' });
  } else {
    // Full website: section links
    for (const section of websiteType.sections || []) {
      navLinks.push({ label: section.label as string, href: `/${section.path as string}/` });
    }
  }
  if (ctaResult) {
    navLinks.push(ctaResult.navLink);
  }

  const header: Record<string, unknown> = {
    navLinks,
  };
  if (ctaResult) {
    header.ctaButton = ctaResult.ctaButton;
  }

  // Build complete footer config
  const footerColumns: Array<Record<string, unknown>> = [];

  // Quick links column
  const quickLinks: Array<{ label: string; href: string }> = [];
  if (websiteType.isBlogOnly) {
    quickLinks.push({ label: 'Home', href: '/' });
  } else {
    for (const section of websiteType.sections || []) {
      quickLinks.push({ label: section.label as string, href: `/${section.path as string}/` });
    }
  }
  if (ctaResult) {
    quickLinks.push(ctaResult.footerLink);
  }
  footerColumns.push({ label: 'Quick Links', links: quickLinks });

  // Legal column
  if (legalPages) {
    footerColumns.push(legalPages);
  }

  const footer: Record<string, unknown> = {
    columns: footerColumns,
  };

  const templateSettings: Record<string, unknown> = {
    hero: websiteType.hero,
    ...(websiteType.sections ? { sections: websiteType.sections } : {}),
    header,
    footer,
  };

  return { templateSettings, localPublish, isBlogOnly: websiteType.isBlogOnly };
}

/**
 * Display batch generation summary
 */
export function displayBatchSummary(
  results: Array<{
    path: string;
    title: string;
    success: boolean;
    error?: string;
    wordCount?: number;
  }>,
  totalTokens: number,
  totalCost: number,
  projectDir: string
): void {
  const { join } = require('path');

  console.error('\n=== Generation Summary ===\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.error(`Processed: ${results.length} article(s)`);
  console.error(`Successful: ${successful.length}`);
  if (failed.length > 0) {
    console.error(`Failed: ${failed.length}`);
  }
  console.error(`Total tokens: ${totalTokens}`);
  console.error(`Total cost: $${totalCost.toFixed(4)}`);

  if (successful.length > 0) {
    console.error('\nGenerated articles:');
    for (const result of successful) {
      const fullPath = join(projectDir, 'drafts', result.path, 'content.md');
      const metaPath = join(projectDir, 'drafts', result.path, META_FILE);
      console.error(`  - ${result.title}`);
      console.error(`    ${fullPath}`);
      console.error(`    ${metaPath}`);
      if (result.wordCount) {
        console.error(`    ${result.wordCount} words`);
      }
    }
  }

  if (failed.length > 0) {
    console.error('\nFailed articles:');
    for (const result of failed) {
      console.error(`  - ${result.path}: ${result.error || 'Unknown error'}`);
      const failedFullPath = join(projectDir, 'drafts', result.path, 'index.json');
      console.error(`    ${failedFullPath}`);
    }
  }
}
