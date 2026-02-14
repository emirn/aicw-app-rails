import { promises as fs } from 'fs';
import path from 'path';
import { ContentPlan, ContentPlanItem, WebsiteInfo, IPage } from './types';
import { getProjectPaths, initializeProjectDirectories } from './config/user-paths';
import { saveDraftFile, planItemToDraftMetadata, listDrafts, Draft } from './utils/draft-utils';

/**
 * Convert ContentPlan to editable Markdown format
 */
export function planToMarkdown(plan: ContentPlan, websiteInfo: WebsiteInfo): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Content Plan: ${websiteInfo.title || plan.website.title}`);
  lines.push('');
  lines.push(`> ${plan.total_articles} articles for ${websiteInfo.url || plan.website.url}`);
  if (websiteInfo.focus_keywords) {
    lines.push(`> Focus: ${websiteInfo.focus_keywords}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Instructions
  lines.push('## How to Edit');
  lines.push('');
  lines.push('- Edit article titles, keywords, or descriptions as needed');
  lines.push('- Add notes in "Your notes" sections to guide content generation');
  lines.push('- Delete articles you don\'t want to generate');
  lines.push('- Reorder articles by moving entire sections');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Articles
  lines.push('## Articles');
  lines.push('');

  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    lines.push(`### ${i + 1}. ${item.title}`);
    lines.push('');
    lines.push(`- **Path**: ${item.path}`);
    lines.push(`- **Keywords**: ${(item.target_keywords || []).join(', ')}`);
    lines.push(`- **Target Words**: ${item.target_words || 2000}`);
    lines.push(`- **Search Intent**: ${item.search_intent || 'Informational'}`);
    lines.push(`- **Funnel Stage**: ${item.funnel_stage || 'Awareness'}`);
    lines.push(`- **Priority**: ${item.priority || 'Medium'}`);
    lines.push('');
    lines.push(`**Description**: ${item.description}`);
    lines.push('');
    lines.push('**Your notes**:');
    lines.push('<!-- Add specific angles, must-cover points, examples, or requirements -->');
    lines.push('');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse Markdown back to ContentPlan
 */
export function markdownToPlan(markdown: string): ContentPlan {
  const items: ContentPlanItem[] = [];

  // Split by article headers (### N. Title)
  const articleRegex = /### (\d+)\. (.+?)(?=\n### \d+\.|$)/gs;
  let match;

  while ((match = articleRegex.exec(markdown)) !== null) {
    const articleBlock = match[0];
    const title = match[2].trim();

    // Extract fields
    const articlePath = extractField(articleBlock, 'Path') || pathify(title);
    const keywords = extractField(articleBlock, 'Keywords')?.split(',').map(k => k.trim()).filter(Boolean) || [];
    const targetWords = parseInt(extractField(articleBlock, 'Target Words') || '2000', 10);
    const searchIntent = extractField(articleBlock, 'Search Intent') || 'Informational';
    const funnelStage = extractField(articleBlock, 'Funnel Stage') || 'Awareness';
    const priority = extractField(articleBlock, 'Priority') || 'Medium';

    // Extract description
    const descMatch = articleBlock.match(/\*\*Description\*\*:\s*(.+?)(?=\n\n|\*\*Your notes\*\*|$)/s);
    const description = descMatch ? descMatch[1].trim() : title;

    // Extract user notes (between "Your notes" and next section or end)
    const notesMatch = articleBlock.match(/\*\*Your notes\*\*:\s*\n(?:<!--[^>]*-->\s*\n)?([\s\S]*?)(?=\n---|\n###|$)/);
    let userNotes = notesMatch ? notesMatch[1].trim() : '';
    // Remove HTML comments
    userNotes = userNotes.replace(/<!--[\s\S]*?-->/g, '').trim();

    items.push({
      id: `item-${items.length + 1}`,
      path: articlePath,
      title,
      description: userNotes ? `${description}\n\nUser notes: ${userNotes}` : description,
      target_keywords: keywords,
      target_words: targetWords,
      search_intent: normalizeSearchIntent(searchIntent),
      funnel_stage: normalizeFunnelStage(funnelStage),
      priority: priorityToNumber(priority),
    });
  }

  // Extract website info from header
  const titleMatch = markdown.match(/# Content Plan: (.+)/);
  const urlMatch = markdown.match(/> \d+ articles for (.+)/);

  return {
    website: {
      url: urlMatch ? urlMatch[1].trim() : '',
      title: titleMatch ? titleMatch[1].trim() : '',
    },
    total_articles: items.length,
    items,
  };
}

/**
 * Extract a field value from markdown block
 */
function extractField(block: string, fieldName: string): string | undefined {
  const regex = new RegExp(`\\*\\*${fieldName}\\*\\*:\\s*(.+?)(?=\\n|$)`);
  const match = block.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Stopwords to filter from paths for cleaner, shorter URLs.
 * Based on SEO best practices (2025-2026): 3-5 words optimal.
 */
const STOPWORDS_FOR_PATHS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'by', 'for', 'with',
  'at', 'in', 'to', 'on', 'as', 'is', 'it', 'how', 'what', 'why', 'when',
  'where', 'which', 'who', 'your', 'my', 'our', 'their', 'this', 'that'
]);

/**
 * Generate a clean, SEO-friendly path from a title.
 * - Removes stopwords for shorter URLs
 * - Limits to maxWords (default 5) for optimal SEO
 * - Uses hyphens between words
 *
 * Examples:
 *   "How to Detect Article Created by AI" → "detect-article-created-ai"
 *   "The Best AI Tools for Content Creation" → "best-ai-tools-content-creation"
 */
function pathify(title: string, maxWords: number = 5): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const words = normalized.split(/\s+/)
    .filter(word => word.length >= 2 && !STOPWORDS_FOR_PATHS.has(word))
    .slice(0, maxWords);
  return words.join('-') || 'article';
}

/**
 * Convert priority string to valid priority type (1 | 2 | 3)
 */
function priorityToNumber(priority: string): 1 | 2 | 3 {
  const map: Record<string, 1 | 2 | 3> = {
    'high': 1,
    'medium': 2,
    'low': 3,
    '1': 1,
    '2': 2,
    '3': 3,
  };
  return map[priority.toLowerCase()] || 2;
}

/**
 * Normalize search intent string to valid type
 */
function normalizeSearchIntent(intent: string): 'informational' | 'commercial' | 'transactional' | 'navigational' {
  const map: Record<string, 'informational' | 'commercial' | 'transactional' | 'navigational'> = {
    'informational': 'informational',
    'commercial': 'commercial',
    'transactional': 'transactional',
    'navigational': 'navigational',
  };
  return map[intent.toLowerCase()] || 'informational';
}

/**
 * Normalize funnel stage string to valid type
 */
function normalizeFunnelStage(stage: string): 'top' | 'middle' | 'bottom' {
  const map: Record<string, 'top' | 'middle' | 'bottom'> = {
    'top': 'top',
    'tofu': 'top',
    'awareness': 'top',
    'middle': 'middle',
    'mofu': 'middle',
    'consideration': 'middle',
    'bottom': 'bottom',
    'bofu': 'bottom',
    'decision': 'bottom',
  };
  return map[stage.toLowerCase()] || 'top';
}

/**
 * Save plan as editable markdown
 */
export async function savePlanAsMarkdown(
  filepath: string,
  plan: ContentPlan,
  websiteInfo: WebsiteInfo
): Promise<void> {
  const markdown = planToMarkdown(plan, websiteInfo);
  await fs.writeFile(filepath, markdown, 'utf-8');
}

/**
 * Load plan from markdown file
 */
export async function loadPlanFromMarkdown(filepath: string): Promise<ContentPlan> {
  const markdown = await fs.readFile(filepath, 'utf-8');
  return markdownToPlan(markdown);
}

/**
 * Generate article brief in Markdown format
 */
export function generateArticleBrief(
  item: ContentPlanItem,
  websiteInfo: WebsiteInfo,
  existingPages: IPage[]
): string {
  const lines: string[] = [];

  lines.push(`# Article Brief: ${item.title}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Core details
  lines.push('## Target');
  lines.push('');
  lines.push(`- **Words**: ${item.target_words || 2000}`);
  lines.push(`- **Keywords**: ${(item.target_keywords || []).join(', ')}`);
  lines.push(`- **Search Intent**: ${item.search_intent || 'Informational'}`);
  lines.push(`- **Audience**: ${websiteInfo.focus_instruction || 'General audience'}`);
  lines.push(`- **Tone**: ${websiteInfo.brand_voice || 'Professional and informative'}`);
  lines.push('');

  // Description
  lines.push('## Description');
  lines.push('');
  lines.push(item.description);
  lines.push('');

  // Your input section - this is where human adds value
  lines.push('## Your Input');
  lines.push('');
  lines.push('<!-- THIS IS WHERE YOU ADD VALUE -->');
  lines.push('');
  lines.push('### Must-cover points');
  lines.push('<!-- List specific points that MUST be included -->');
  lines.push('');
  lines.push('');
  lines.push('### Examples to include');
  lines.push('<!-- Add real-world examples, case studies, or data -->');
  lines.push('');
  lines.push('');
  lines.push('### Tone/style notes');
  lines.push('<!-- Any specific tone adjustments or style requirements -->');
  lines.push('');
  lines.push('');

  // Context
  lines.push('---');
  lines.push('');
  lines.push('## Context (auto-filled)');
  lines.push('');
  lines.push(`**Website**: ${websiteInfo.title || 'Unknown'}`);
  lines.push(`**URL**: ${websiteInfo.url}`);
  if (websiteInfo.focus_keywords) {
    lines.push(`**Focus Keywords**: ${websiteInfo.focus_keywords}`);
  }
  lines.push('');

  // Existing pages for internal linking
  if (existingPages.length > 0) {
    lines.push('### Existing pages (for internal links)');
    lines.push('');
    const pagesToShow = existingPages.slice(0, 10);
    for (const page of pagesToShow) {
      lines.push(`- [${page.title}](/${page.path})`);
    }
    if (existingPages.length > 10) {
      lines.push(`- ... and ${existingPages.length - 10} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse article brief and extract user input
 */
export function parseArticleBrief(markdown: string): {
  mustCover: string;
  examples: string;
  toneNotes: string;
} {
  const extractSection = (header: string): string => {
    const regex = new RegExp(`### ${header}\\s*\\n(?:<!--[^>]*-->\\s*\\n)?([\\s\\S]*?)(?=\\n###|\\n---|$)`);
    const match = markdown.match(regex);
    if (!match) return '';
    return match[1].replace(/<!--[\s\S]*?-->/g, '').trim();
  };

  return {
    mustCover: extractSection('Must-cover points'),
    examples: extractSection('Examples to include'),
    toneNotes: extractSection('Tone/style notes'),
  };
}

/**
 * Generate individual draft files from a content plan
 * Each plan item becomes a separate .md file in the drafts/ folder
 */
export async function generateDraftFiles(
  projectName: string,
  plan: ContentPlan
): Promise<number> {
  const paths = getProjectPaths(projectName);
  await initializeProjectDirectories(projectName);

  let created = 0;
  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    const metadata = planItemToDraftMetadata(item, i);
    const filename = `${String(i + 1).padStart(2, '0')}-${item.path}.md`;
    const filepath = path.join(paths.drafts, filename);

    await saveDraftFile(filepath, metadata, '');
    created++;
  }

  return created;
}

/**
 * Load drafts as a content plan (for backward compatibility)
 */
export async function loadDraftsAsContentPlan(projectName: string): Promise<ContentPlan> {
  const drafts = await listDrafts(projectName);

  const items: ContentPlanItem[] = drafts.map((draft, index) => ({
    id: draft.metadata.id,
    path: draft.metadata.path,
    title: draft.metadata.title,
    description: draft.metadata.description + (draft.seedContent ? `\n\nSeed content:\n${draft.seedContent}` : ''),
    target_keywords: draft.metadata.keywords.split(',').map(k => k.trim()).filter(Boolean),
    target_words: draft.metadata.target_words,
    search_intent: draft.metadata.search_intent as 'informational' | 'commercial' | 'transactional' | 'navigational',
    funnel_stage: draft.metadata.funnel_stage as 'top' | 'middle' | 'bottom',
    priority: draft.metadata.priority as 1 | 2 | 3,
  }));

  return {
    website: {
      url: '',
      title: '',
    },
    total_articles: items.length,
    items,
  };
}

/**
 * Convert a Draft to a ContentPlanItem
 */
export function draftToContentPlanItem(draft: Draft): ContentPlanItem {
  return {
    id: draft.metadata.id,
    path: draft.metadata.path,
    title: draft.metadata.title,
    description: draft.metadata.description + (draft.seedContent ? `\n\nSeed content:\n${draft.seedContent}` : ''),
    target_keywords: draft.metadata.keywords.split(',').map(k => k.trim()).filter(Boolean),
    target_words: draft.metadata.target_words,
    search_intent: draft.metadata.search_intent as 'informational' | 'commercial' | 'transactional' | 'navigational',
    funnel_stage: draft.metadata.funnel_stage as 'top' | 'middle' | 'bottom',
    priority: draft.metadata.priority as 1 | 2 | 3,
  };
}
