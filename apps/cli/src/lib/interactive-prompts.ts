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
import { LegalPagesChoice } from './legal-pages';


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

      // Capture any remaining buffered input (last line without trailing \n)
      const remaining = (rl as any).line;
      if (remaining && remaining.length > 0) {
        lines.push(remaining);
      }

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
  const categories = ['digital_illustration', 'vector_illustration', 'realistic_image'];
  const categoryLabels: Record<string, string> = {
    digital_illustration: 'Digital Illustration',
    vector_illustration: 'Vector Illustration',
    realistic_image: 'Realistic Image',
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
      { name: 'path', question: 'Article path (optional, auto-generated from title)' },
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

const MAX_TITLE_LENGTH = 60;
const MAX_OLDEST_ARTICLES_TO_SHOW = 25;

/**
 * Result of parsing article selection input
 */
interface SelectionResult {
  type: 'all' | 'indices' | 'quit';
  indices?: number[];  // 0-based indices into sorted array
  warning?: string;    // Warning message (e.g., truncation)
}

/**
 * Extract keyword filters (date:YYYY-MM-DD, url:pattern) from input string.
 * Returns the base input (with filters removed) and any extracted filters.
 */
function extractFilters(input: string): { baseInput: string; dateFilter?: string; urlFilter?: string } {
  let baseInput = input;
  let dateFilter: string | undefined;
  let urlFilter: string | undefined;

  // Extract date:YYYY-MM-DD
  const dateMatch = baseInput.match(/\bdate:(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) {
    dateFilter = dateMatch[1];
    baseInput = baseInput.replace(dateMatch[0], '');
  }

  // Extract url:PATTERN (non-whitespace chars after url:)
  const urlMatch = baseInput.match(/\burl:(\S+)/);
  if (urlMatch) {
    urlFilter = urlMatch[1];
    baseInput = baseInput.replace(urlMatch[0], '');
  }

  return { baseInput: baseInput.trim(), dateFilter, urlFilter };
}

/**
 * Apply date and url filters to an article list.
 * Returns items with their original indices preserved.
 */
function applyFilters(
  articles: ArticleForSelection[],
  totalArticles: number,
  dateFilter?: string,
  urlFilter?: string
): { originalIndex: number; article: ArticleForSelection }[] {
  let workingList = articles
    ? articles.map((article, idx) => ({ originalIndex: idx, article }))
    : Array.from({ length: totalArticles }, (_, idx) => ({ originalIndex: idx, article: null as any }));

  if (dateFilter && articles) {
    const maxDate = new Date(dateFilter + 'T23:59:59Z');
    workingList = workingList.filter(item => new Date(item.article.created_at) <= maxDate);
  }

  if (urlFilter && articles) {
    workingList = workingList.filter(item => item.article.path.includes(urlFilter));
  }

  return workingList;
}

/**
 * Slice a 1-based range from a filtered working list.
 */
function sliceRange(
  filtered: { originalIndex: number; article: ArticleForSelection }[],
  startNum: number,
  count: number
): { indices: number[]; warning?: string } {
  const effectiveTotal = filtered.length;

  if (startNum < 1 || startNum > effectiveTotal) {
    return {
      indices: [],
      warning: `Start index ${startNum} is out of range (1-${effectiveTotal})`,
    };
  }

  if (count === 0) {
    return { indices: [] };
  }

  const startIdx = startNum - 1;
  const requestedEnd = startIdx + count;
  const actualEnd = Math.min(requestedEnd, effectiveTotal);

  const indices: number[] = [];
  for (let i = startIdx; i < actualEnd; i++) {
    indices.push(filtered[i].originalIndex);
  }

  let warning: string | undefined;
  if (requestedEnd > effectiveTotal) {
    const actualCount = actualEnd - startIdx;
    warning = `Requested ${count} articles from ${startNum}, only ${actualCount} available`;
  }

  return { indices, warning };
}

/**
 * Parse article selection input
 * Supports: comma-separated numbers, range "N:M", keyword filters "date:YYYY-MM-DD" and "url:path/", "all", "q"
 *
 * @param input - User input string
 * @param totalArticles - Total number of available articles
 * @param articles - Optional array of articles for date/url filtering
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

  // Extract keyword filters
  const { baseInput, dateFilter, urlFilter } = extractFilters(trimmed);
  const hasFilters = !!(dateFilter || urlFilter);

  // Apply filters to get working list
  const filtered = hasFilters && articles
    ? applyFilters(articles, totalArticles, dateFilter, urlFilter)
    : (articles
      ? articles.map((article, idx) => ({ originalIndex: idx, article }))
      : Array.from({ length: totalArticles }, (_, idx) => ({ originalIndex: idx, article: null as any })));

  // Build filter description for warnings
  const filterParts: string[] = [];
  if (dateFilter) filterParts.push(`date <= ${dateFilter}`);
  if (urlFilter) filterParts.push(`url contains '${urlFilter}'`);
  const filterDesc = filterParts.length > 0 ? filterParts.join(', ') : undefined;

  // Check if filters matched anything
  if (hasFilters && filtered.length === 0) {
    return {
      type: 'indices',
      indices: [],
      warning: `No articles match filters (${filterDesc})`,
    };
  }

  const base = baseInput.toLowerCase();

  // "all" with optional filters
  if (base === 'all') {
    if (hasFilters) {
      const indices = filtered.map(item => item.originalIndex);
      return {
        type: 'indices',
        indices,
        warning: `Filter (${filterDesc}): ${filtered.length} articles selected`,
      };
    }
    return { type: 'all' };
  }

  // Range syntax: N:M where N=start (1-based), M=count
  const rangeMatch = base.match(/^(\d+):(\d+)$/);
  if (rangeMatch) {
    const startNum = parseInt(rangeMatch[1], 10);
    const count = parseInt(rangeMatch[2], 10);

    const { indices, warning: sliceWarning } = sliceRange(filtered, startNum, count);

    let warning: string | undefined;
    if (hasFilters) {
      warning = `Filter (${filterDesc}): ${filtered.length} articles`;
    }
    if (sliceWarning) {
      warning = warning ? `${warning}; ${sliceWarning}` : sliceWarning;
    }

    return { type: 'indices', indices, warning };
  }

  // Single number with filters: e.g. "5 url:blog/"
  const singleMatch = base.match(/^(\d+)$/);
  if (singleMatch && hasFilters) {
    const num = parseInt(singleMatch[1], 10);
    if (num < 1 || num > filtered.length) {
      return {
        type: 'indices',
        indices: [],
        warning: `Index ${num} is out of range for filtered list (1-${filtered.length})`,
      };
    }
    return {
      type: 'indices',
      indices: [filtered[num - 1].originalIndex],
      warning: `Filter (${filterDesc}): picked #${num} of ${filtered.length}`,
    };
  }

  // Comma-separated numbers (no filter support)
  const indices: number[] = [];
  const nums = trimmed.split(',').map((s) => parseInt(s.trim(), 10));

  for (const num of nums) {
    if (!isNaN(num) && num >= 1 && num <= totalArticles) {
      indices.push(num - 1);
    }
  }

  return { type: 'indices', indices };
}

/**
 * Options for the generic article selector
 */
interface SelectArticlesOptions {
  header: string;
  showPriority?: boolean;
  sortByCreatedAt?: boolean;
}

/**
 * Generic article selector — reusable for generate, enhance, review, etc.
 * Shows numbered list, supports selection loop with numbers, ranges, filters, all, q.
 *
 * @param articles - Pre-filtered list of articles eligible for selection
 * @param options - Display options (header text, priority indicator, sorting)
 * @returns Array of selected article paths, or null if cancelled
 */
export async function selectArticles(
  articles: ArticleForSelection[],
  options: SelectArticlesOptions
): Promise<string[] | null> {
  if (articles.length === 0) {
    console.error('\nNo articles available.\n');
    return null;
  }

  const sorted = options.sortByCreatedAt
    ? [...articles].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : articles;

  // Display subset (max N)
  const displayArticles = sorted.slice(0, MAX_OLDEST_ARTICLES_TO_SHOW);
  const displayCount = Math.min(sorted.length, MAX_OLDEST_ARTICLES_TO_SHOW);

  console.error(`\n=== ${options.header} (${displayCount} of ${sorted.length}) ===\n`);

  for (let i = 0; i < displayArticles.length; i++) {
    const article = displayArticles[i];
    const priority = options.showPriority ? getPriorityIndicator(article.priority) + ' ' : '';
    const date = article.created_at ? formatDate(article.created_at) : 'Unknown';
    const title = truncateTitle(article.title || article.path, MAX_TITLE_LENGTH);
    console.error(`  ${String(i + 1).padStart(2)}. ${priority}${date.padEnd(14)} ${title.padEnd(62)} ${article.path}/`);
  }

  if (sorted.length > MAX_OLDEST_ARTICLES_TO_SHOW) {
    const remaining = sorted.length - MAX_OLDEST_ARTICLES_TO_SHOW;
    const nextStart = MAX_OLDEST_ARTICLES_TO_SHOW + 1;
    console.error(`\n  ... and ${remaining} more (use range syntax, e.g., '${nextStart}:10' for articles ${nextStart}-${nextStart + 9})`);
  }
  console.error('');

  while (true) {
    const answer = await prompt("Enter numbers (e.g., '1,3,5'), range 'N:M', filters 'date:YYYY-MM-DD url:path/', 'all', or 'q'");

    const result = parseArticleSelection(answer, sorted.length, sorted);

    if (result.type === 'quit') {
      return null;
    }

    let selectedPaths: string[];
    if (result.type === 'all') {
      selectedPaths = sorted.map((a) => a.path);
    } else {
      selectedPaths = (result.indices || []).map((idx) => sorted[idx].path);
    }

    if (selectedPaths.length === 0) {
      console.error(result.warning ? `Warning: ${result.warning}` : 'No articles matched.');
      continue;
    }

    if (result.warning) {
      console.error(`  ${result.warning}`);
    }

    console.error(`\nSelected ${selectedPaths.length} article(s):`);
    for (const p of selectedPaths.slice(0, 10)) {
      const info = sorted.find(a => a.path === p);
      console.error(`  - ${info ? truncateTitle(info.title || info.path, 60) : p}  ${p}/`);
    }
    if (selectedPaths.length > 10) {
      console.error(`  ... and ${selectedPaths.length - 10} more`);
    }

    const ok = await prompt('Proceed? (Y/n)');
    if (!ok || ok.trim().toLowerCase() === 'y' || ok.trim() === '') {
      return selectedPaths.length > 0 ? selectedPaths : null;
    }
  }
}

/**
 * Simple numbered article selector for generation
 * Shows max 25 oldest articles with numbers and priority indicators
 *
 * @param articles - Array of articles with path, title, created_at, priority
 * @returns Array of selected article paths
 */
export async function selectArticlesForGeneration(
  articles: ArticleForSelection[]
): Promise<string[]> {
  const result = await selectArticles(articles, {
    header: 'Articles Ready to Generate',
    showPriority: true,
    sortByCreatedAt: true,
  });
  return result || [];
}

/**
 * Select articles ready for enhancement
 *
 * @param articles - Pre-filtered list of articles eligible for the pipeline
 * @returns Array of selected article paths, or null if cancelled
 */
export async function selectArticlesForEnhancement(
  articles: ArticleForSelection[]
): Promise<string[] | null> {
  return selectArticles(articles, {
    header: 'Articles Ready to Enhance',
  });
}

/**
 * Action metadata returned from sgen API
 */
interface ActionInfo {
  name: string;
  description: string;
  forcible: boolean;
  output_mode?: string;
  local?: boolean;
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
    console.error(`  ${String(i + 1).padStart(2)}. ${date.padEnd(14)} ${title.padEnd(62)} ${article.path}/`);
  }

  if (sorted.length > MAX_OLDEST_ARTICLES_TO_SHOW) {
    const remaining = sorted.length - MAX_OLDEST_ARTICLES_TO_SHOW;
    const nextStart = MAX_OLDEST_ARTICLES_TO_SHOW + 1;
    console.error(`\n  ... and ${remaining} more (use range syntax, e.g., '${nextStart}:10')`);
  }
  console.error('');

  // Step 1: Select articles
  const answer = await prompt("Select articles (e.g., '1,3,5'), range 'N:M', 'all', or 'q'");
  const result = parseArticleSelection(answer, sorted.length);

  if (result.warning) {
    console.error(`Warning: ${result.warning}`);
  }

  if (result.type === 'quit') {
    return null;
  }

  let selectedPaths: string[];
  if (result.type === 'all') {
    selectedPaths = sorted.map((a) => a.path);
  } else {
    selectedPaths = (result.indices || []).map((idx) => sorted[idx].path);
  }

  if (selectedPaths.length === 0) {
    return null;
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
 * Generate suggested path for conflict resolution
 * Appends -2, -3, etc. based on existing suffix
 */
function suggestNewPath(originalPath: string): string {
  // Check if already ends with -N
  const match = originalPath.match(/-(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return originalPath.replace(/-\d+$/, `-${num + 1}`);
  }
  return `${originalPath}-2`;
}

/**
 * Resolve conflicts interactively - show editable path
 * User presses Enter to accept suggested path or edits then presses Enter
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

    // Suggest modified path
    const suggestedPath = suggestNewPath(item.articlePath);

    // Show editable prompt with suggested value
    const newPath = await promptWithDefault(
      '  New URL (Enter to accept, or edit, or "s" to skip):',
      suggestedPath
    );

    if (newPath === 's' || newPath === 'skip') {
      resolved.set(item.articlePath, 'skip');
      console.error('  → Skipped\n');
    } else {
      resolved.set(item.articlePath, newPath);
      console.error(`  → Will create: ${newPath}\n`);
    }
  }

  return resolved;
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

/**
 * Prompt user for legal pages preference during project init.
 * Returns LegalPagesChoice with mode and optional external URLs.
 */
export async function promptLegalPagesChoice(): Promise<LegalPagesChoice> {
  console.error('\n=== Legal Pages (Privacy & Terms) ===\n');
  console.error('  1. Built-in pages (recommended) - generates editable markdown pages');
  console.error('  2. External links - point to your own privacy/terms URLs');
  console.error('  3. Skip - no legal pages');
  console.error('');

  const answer = await prompt('Enter choice (1, 2, or 3)', '1');
  const choice = parseInt(answer, 10);

  if (choice === 2) {
    const privacyUrl = await prompt('Privacy policy URL');
    const termsUrl = await prompt('Terms of service URL');
    return { mode: 'external', privacyUrl: privacyUrl || undefined, termsUrl: termsUrl || undefined };
  }

  if (choice === 3) {
    return { mode: 'none' };
  }

  // Default to built-in
  return { mode: 'builtin' };
}
