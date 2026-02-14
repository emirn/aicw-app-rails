#!/usr/bin/env node

/**
 * BlogPostGen CLI - Unified Action Architecture
 *
 * Usage:
 *   blogpostgen <action> [path] [options]
 *
 * Actions (local - no API):
 *   project-init      Create new project with default template
 *   article-seed      Create seed article ready for generation
 *
 * Actions (API - pipeline):
 *   plan-import       Import content plan from plain text file (TITLE:/URL:/KEYWORDS:/DESCRIPTION:)
 *   generate          Generate article from brief
 *   enhance           Enhance article with AI
 *
 * Actions (API - single):
 *   mark-reviewed     Mark article as reviewed
 *   finalize          Mark article as final
 *   status            Show project or article status
 */

import { initializeUserDirectories, getUserProjectDir } from './config/user-paths';
import { output, outputError } from './lib/output';
import { Logger } from './logger';
import { APIExecutor, PipelineInfo, PipelineConfig, ArticleFilter } from './lib/api-executor';
import {
  promptForMissingArgs,
  showInteractiveHelp,
  selectArticlesForGeneration,
  selectArticlesForEnhancement,
  selectArticlesForForceEnhance,
  selectProject,
  ArticleForSelection,
  CREATE_NEW_PROJECT,
  pressEnterToContinue,
  displayBatchSummary,
  promptPlanImportSource,
  promptMultilineInput,
  resolveConflictsInteractive,
  confirm,
  selectIllustrationStyle,
  promptInput,
  parseArticleSelection,
  promptLegalPagesChoice,
} from './lib/interactive-prompts';
import { getProjectPaths } from './config/user-paths';
import { resolvePath, projectExists, getArticles, readArticleContent, getSeedArticles, getArticlesAfterPipeline } from './lib/path-resolver';
import path from 'path';
import { initializeProject, loadProjectConfig, saveProjectConfig } from './lib/project-config';
import { createBuiltinLegalPages, getLegalFooterColumns, LegalPagesChoice } from './lib/legal-pages';
import { createArticleFolder, articleFolderExists, buildPublished, updateArticleMeta, addAppliedAction, getArticleMeta } from './lib/folder-manager';
import { IArticle } from '@blogpostgen/types';
import { initializePromptTemplates, getRequirementsFile, mergeProjectTemplateDefaults } from './lib/prompt-loader';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { generateImageSocialLocal, verifyAssetsLocal, verifyLinksLocal, isLocalMode } from './lib/local-actions';
import { loadExcludedActions, filterPipelineActions } from './lib/pipeline-exclude';
import { setPublishablePattern, setPipelinesMap } from './lib/workflow';
import {
  importPlanFromFile,
  importPlanFromContent,
  printParseSummary,
  analyzeImport,
  displayImportPreview,
  executeResolvedImport,
  parsePlanFile,
} from './lib/plan-importer';
import { simplePlanToPlan, planToSimpleText } from './lib/simple-plan-parser';
import { syncActionPrompts } from './lib/prompt-sync';
import {
  migrateToUnifiedFormat,
  checkMigrationNeeded,
  migrateFaqFromContentProject,
  migrateJsonldFromContentProject,
  migrateContentExtractAllProject,
  migrateBackfillPublishedAt,
} from './lib/migrate';
import { verifyProject, fixArticles } from './lib/pipeline-verify';
import { findOrphanedAssets, removeAssets, findLegacyIndexFields, fixLegacyIndexFields } from './lib/assets-cleanup';
import chalk from 'chalk';

/**
 * Module-level debug state (toggled in interactive menu with 'd')
 */
let debugEnabled = false;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Local actions handled entirely by CLI (no sgen API needed)
 */
const LOCAL_ACTIONS = [
  // Project group (1-99)
  { name: 'project-init', description: 'Create new project with default template', usage: 'blogpostgen project-init --name <name>', group: 'project' },
  { name: 'project-reinit', description: 'Add missing default configs to project', usage: 'blogpostgen project-reinit <project>', group: 'project' },
  { name: 'article-seed', description: 'Create seed article ready for generation', usage: 'blogpostgen article-seed <project> --title <title>', group: 'project' },
  { name: 'plan-import', description: 'Import content plan from plain text file', usage: 'blogpostgen plan-import <project> --file <path>', group: 'project' },
  { name: 'ideas', description: 'AI-expand ideas into content plan and import', usage: 'blogpostgen ideas <project>', group: 'project' },
  { name: 'status', description: 'Show project or article status', usage: 'blogpostgen status [path]', group: 'project' },

  // Utility group (101-199)
  { name: 'force-enhance', description: 'Re-run actions on enhanced articles', usage: 'blogpostgen force-enhance <project>', group: 'utility' },
  { name: 'migrate', description: 'Migrate project to unified index.json format', usage: 'blogpostgen migrate <project>', group: 'utility' },
  { name: 'migrate-faq', description: 'Extract FAQ from content to faq.md', usage: 'blogpostgen migrate-faq <project>', group: 'utility' },
  { name: 'migrate-jsonld', description: 'Extract JSON-LD from content to jsonld.md', usage: 'blogpostgen migrate-jsonld <project>', group: 'utility' },
  { name: 'migrate-content', description: 'Extract both FAQ and JSON-LD from content', usage: 'blogpostgen migrate-content <project>', group: 'utility' },
  { name: 'migrate-published-at', description: 'Backfill published_at from updated_at', usage: 'blogpostgen migrate-published-at <project>', group: 'utility' },
  { name: 'pipeline-verify', description: 'Verify pipeline state & applied actions', usage: 'blogpostgen pipeline-verify <project> [--fix]', group: 'utility' },
  { name: 'assets-cleanup', description: 'Find and remove unreferenced article assets', usage: 'blogpostgen assets-cleanup <project>', group: 'utility' },

  // Publishing group (201-299)
  { name: 'publish', description: 'Publish articles to local website folder', usage: 'blogpostgen publish <project>', group: 'publish' },
  { name: 'wb-preview', description: 'Build and preview published articles as website', usage: 'blogpostgen wb-preview <project>', group: 'publish' },
  { name: 'wb-build', description: 'Build website locally (no API server needed)', usage: 'blogpostgen wb-build <project>', group: 'publish' },
];

/**
 * Parse command line arguments
 */
function parseArgs(argv: string[]): {
  action: string | undefined;
  path: string | undefined;
  flags: Record<string, any>;
  interactive: boolean;
  baseUrl: string;
  debug: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  const flags: Record<string, any> = {};
  let action: string | undefined;
  let path: string | undefined;
  let interactive = false;
  let baseUrl = process.env.SGEN_URL || 'http://localhost:3001';
  let debug = false;
  let help = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      help = true;
      i++;
    } else if (arg === '-i' || arg === '--interactive') {
      interactive = true;
      i++;
    } else if (arg === '--base') {
      baseUrl = args[i + 1] || baseUrl;
      i += 2;
    } else if (arg === '--debug') {
      debug = true;
      i++;
    } else if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 0) {
        const key = arg.slice(2, eqIdx);
        const value = arg.slice(eqIdx + 1);
        flags[key] = parseValue(value);
      } else {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          flags[key] = parseValue(nextArg);
          i++;
        } else {
          flags[key] = true;
        }
      }
      i++;
    } else if (!action) {
      action = arg;
      i++;
    } else if (!path) {
      path = arg;
      i++;
    } else {
      path = path + '/' + arg;
      i++;
    }
  }

  return { action, path, flags, interactive, baseUrl, debug, help };
}

/**
 * Parse a value from string
 */
function parseValue(val: string): any {
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = Number(val);
  if (!isNaN(num)) return num;
  return val;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
BlogPostGen CLI - AI-powered SEO article generation

USAGE:
  blogpostgen <action> [path] [options]

ACTIONS:
  project-init       Create new project with default template
  plan-import        Import content plan from plain text file
  plan-add           Add new article to project
  generate           Generate article content from briefs
  enhance            Enhance articles with AI
  publish            Build published articles from ready/ folder
  mark-reviewed      Mark article as reviewed
  finalize           Mark article as final
  status             Show project or article status
  list-actions       List all available API actions

GLOBAL OPTIONS:
  -i, --interactive  Enable interactive mode (prompts for missing args)
  --base <url>       Sgen API base URL (default: http://localhost:3001)
  --range "N:M [date:YYYY-MM-DD] [url:path/]"  Batch select with optional filters (e.g., --range "1:50 url:blog/")
  --debug            Enable debug output
  -h, --help         Show this help

EXAMPLES:
  # Create a new project (then customize prompts/write_draft/prompt.md)
  blogpostgen project-init --name my-blog

  # Import content plan from file
  blogpostgen plan-import my-blog --file content-plan.txt

  # Add a single article
  blogpostgen plan-add my-blog --title "How to optimize Node.js"

  # Generate articles (interactive selection)
  blogpostgen generate my-blog

  # Generate articles 1-50 in batch (non-interactive)
  blogpostgen generate my-blog --range 1:50

  # Interactive mode (recommended)
  blogpostgen -i

For more help, see: https://github.com/emirn/blogpostgen
`);
}

/**
 * Print actions from API
 */
function printActions(actions: { name: string; description: string; usage: string; estimatedCost?: number }[]): void {
  console.log('\nAvailable actions:\n');

  for (const action of actions) {
    const cost = action.estimatedCost ? ` (~$${action.estimatedCost.toFixed(2)})` : '';
    console.log(`  ${action.name.padEnd(16)} - ${action.description}${cost}`);
    console.log(`                     ${action.usage}`);
  }
  console.log('');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Initialize user directories
  try {
    await initializeUserDirectories();
  } catch (error) {
    outputError(error instanceof Error ? error.message : 'Failed to initialize directories', 'INIT_ERROR');
    process.exit(1);
  }

  // Parse arguments
  const { action, path: pathArg, flags, interactive, baseUrl, debug, help } = parseArgs(process.argv);

  // Logger for progress messages (stderr)
  const logger = new Logger();
  if (debug) {
    logger.log(`Debug mode enabled`);
    logger.log(`Base URL: ${baseUrl}`);
    logger.log(`Action: ${action}`);
    logger.log(`Path: ${pathArg}`);
    logger.log(`Flags: ${JSON.stringify(flags)}`);
  }

  // Show help
  if (help || (!action && !interactive)) {
    printHelp();
    process.exit(0);
  }

  // API executor
  const executor = new APIExecutor(baseUrl, logger);

  // Store publishableFilter from pipelines config (fetched on first API call)
  let publishableFilter: string | undefined;

  // Interactive mode - main loop for action selection and execution
  let finalAction = action;
  let finalPath = pathArg;
  let finalFlags = flags;

  // Main interactive loop - keeps returning to action menu after each action
  let firstIteration = true;
  while (interactive) {
    // On first iteration, use command-line action if provided
    if (firstIteration && action) {
      finalAction = action;
      finalPath = pathArg;
      finalFlags = { ...flags };
      firstIteration = false;
    } else {
      // Reset for each iteration
      finalAction = undefined as any;
      finalPath = undefined;
      finalFlags = { ...flags };

      // Fetch pipelines from API
      const pipelinesResult = await executor.listPipelines();
      if (!pipelinesResult.success) {
        outputError(pipelinesResult.error || 'Failed to fetch pipelines', 'API_ERROR');
        process.exit(1);
      }

      // Store publishableFilter and update workflow module
      if (pipelinesResult.publishableFilter) {
        publishableFilter = pipelinesResult.publishableFilter;
        setPublishablePattern(pipelinesResult.publishableFilter);
      }

      // Build dynamic pipeline transitions map from config
      if (pipelinesResult.pipelines) {
        setPipelinesMap(pipelinesResult.pipelines);
      }

      // Build menu: local actions + pipelines from API
      const allActions = [
        ...LOCAL_ACTIONS.map(a => ({ ...a, category: 'local' })),
        ...(pipelinesResult.pipelines || []).map(p => ({
          name: p.name,
          description: p.description,
          usage: `blogpostgen ${p.name} <project>`,
          category: 'pipeline',
        }))
      ];

      const selectedAction = await showInteractiveHelp(allActions, debugEnabled);
      if (!selectedAction) {
        process.exit(0); // User quit with 'q'
      }

      // Handle debug toggle
      if (selectedAction === 'd' || selectedAction === 'debug') {
        debugEnabled = !debugEnabled;
        logger.log(chalk.magenta(`Debug mode: ${debugEnabled ? 'ON' : 'OFF'}`));
        continue;
      }

      finalAction = selectedAction;
    }

    // Handle list-actions (quick action, then loop back)
    if (finalAction === 'list-actions') {
      const listResult = await executor.listActions();
      if (listResult.success) {
        printActions(listResult.actions || []);
      }
      await pressEnterToContinue();
      continue;
    }

    // Handle project-init
    if (finalAction === 'project-init') {
      const filledArgs = await promptForMissingArgs('project-init', {});
      const projectName = filledArgs.name as string;

      if (!projectName) {
        logger.log('No project name provided.');
        await pressEnterToContinue();
        continue;
      }

      const sanitizedName = projectName
        .toLowerCase()
        .replace(/[^a-z0-9-_.]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (!sanitizedName) {
        logger.log('Invalid project name. Use alphanumeric characters, dashes, or dots.');
        await pressEnterToContinue();
        continue;
      }

      const projectDir = getUserProjectDir(sanitizedName);

      if (existsSync(projectDir)) {
        logger.log(`Project '${sanitizedName}' already exists at ${projectDir}`);
        await pressEnterToContinue();
        continue;
      }

      try {
        // Derive URL from project name if it looks like a domain (contains a dot)
        const projectUrl = sanitizedName.includes('.')
          ? sanitizedName
          : undefined;

        // Prompt for site description (multiline)
        logger.log('');
        const siteDescription = await promptMultilineInput(
          'Describe your website (what it\'s about, target audience, tone).\nThis helps AI generate branding (colors, fonts, style).\nPress Enter twice when done:'
        );

        // Prompt for color preference (optional, single line)
        const colorPreference = await promptInput(
          'Color preference (optional, e.g. "modern blue and purple")'
        );

        // Try AI-powered branding generation
        let aiBranding: any = null;
        if (siteDescription) {
          logger.log('');
          logger.log('Generating branding with AI...');
          const configResult = await executor.generateProjectConfig({
            site_name: projectName,
            site_description: siteDescription,
            site_url: projectUrl,
            color_preference: colorPreference || undefined,
          });

          if (configResult.success && configResult.branding) {
            logger.log('');
            logger.log('Generated branding:');
            logger.log(JSON.stringify(configResult.branding, null, 2));
            if (configResult.cost_usd) {
              logger.log(`  (cost: $${configResult.cost_usd.toFixed(4)})`);
            }
            logger.log('');

            const useAi = await confirm('Use these AI-generated settings?');
            if (useAi) {
              aiBranding = configResult.branding;
            } else {
              logger.log('AI branding declined, falling back to manual selection.');
            }
          } else {
            logger.log(`AI branding generation failed: ${configResult.error || 'Unknown error'}`);
            logger.log('Falling back to manual selection.');
          }
        }

        // Fallback: manual illustration style picker
        let illustrationStyle: string | null = null;
        if (!aiBranding) {
          illustrationStyle = await selectIllustrationStyle();
        }

        logger.log(`Creating project '${sanitizedName}'...`);
        await initializeProject(projectDir, { title: projectName, url: projectUrl });

        logger.log('Applying project template defaults...');
        await mergeProjectTemplateDefaults(projectDir, {
          ...(aiBranding ? { branding: aiBranding } : { illustrationStyle: illustrationStyle || undefined }),
        });

        // Legal pages setup
        const legalChoice = await promptLegalPagesChoice();
        if (legalChoice.mode === 'builtin') {
          const siteUrl = projectUrl ? (projectUrl.startsWith('http') ? projectUrl : `https://${projectUrl}`) : 'https://example.com';
          const legalResult = await createBuiltinLegalPages(projectDir, projectName, siteUrl);
          if (legalResult.created.length > 0) {
            logger.log(`Created legal pages: ${legalResult.created.join(', ')}`);
          }
        }
        if (legalChoice.mode !== 'none') {
          // Update footer columns in project config
          const config = await loadProjectConfig(projectDir);
          if (config) {
            if (!config.publish_to_local_folder) {
              config.publish_to_local_folder = { enabled: false, path: '', content_subfolder: 'articles', assets_subfolder: 'assets', template_settings: {} };
            }
            const ts = (config.publish_to_local_folder.template_settings || {}) as Record<string, any>;
            if (!ts.footer) ts.footer = {};
            ts.footer.columns = getLegalFooterColumns(legalChoice);
            config.publish_to_local_folder.template_settings = ts;
            await saveProjectConfig(projectDir, config);
          }
        }

        logger.log('Applying default requirements template...');
        await initializePromptTemplates(projectDir);

        // Initialize default action configs
        logger.log('Initializing default action configs...');
        const actionConfigResult = await executor.getActionConfig();
        if (actionConfigResult.success && actionConfigResult.config) {
          const { reinitProject, formatCreatedFilesOutput } = await import('./lib/project-reinit');
          const reinitResult = await reinitProject(sanitizedName, actionConfigResult.config);
          if (reinitResult.created.length > 0) {
            formatCreatedFilesOutput(reinitResult.created, logger, projectDir);
          }
        }

        const indexJsonPath = path.join(projectDir, 'index.json');
        const customMdPath = path.join(projectDir, 'config', 'actions', 'write_draft', 'custom.md');

        logger.log('');
        logger.log(`✓ Project '${sanitizedName}' created!`);
        logger.log('');
        logger.log('Review your settings:');
        logger.log(`  Branding: ${indexJsonPath}`);
        logger.log(`  Writing voice: ${customMdPath}`);
        logger.log('');
        logger.log('Next steps:');
        logger.log(`  1. Review branding in index.json`);
        logger.log(`  2. Edit writing voice in custom.md`);
        logger.log(`  3. Then run: blogpostgen -i generate`);
        logger.log('');
        await pressEnterToContinue();
        continue;
      } catch (error) {
        logger.log(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        await pressEnterToContinue();
        continue;
      }
    }

    // Handle project-reinit (local action - add missing default configs)
    if (finalAction === 'project-reinit') {
      const selectedProject = finalPath || await selectProject();
      if (!selectedProject) {
        logger.log('No project selected.');
        await pressEnterToContinue();
        continue;
      }

      if (selectedProject === CREATE_NEW_PROJECT) {
        logger.log('Please create a project first with project-init.');
        await pressEnterToContinue();
        continue;
      }

      logger.log(`\nReinitializing project: ${selectedProject}\n`);

      // Fetch action configs from API
      const actionConfigResult = await executor.getActionConfig();
      if (!actionConfigResult.success || !actionConfigResult.config) {
        logger.log(`Failed to fetch action configs: ${actionConfigResult.error || 'Unknown error'}`);
        await pressEnterToContinue();
        continue;
      }

      const reinitProjectPaths = getProjectPaths(selectedProject);
      const { reinitProject, formatCreatedFilesOutput } = await import('./lib/project-reinit');
      const result = await reinitProject(selectedProject, actionConfigResult.config);

      if (result.created.length > 0) {
        formatCreatedFilesOutput(result.created, logger, reinitProjectPaths.root);
      }

      if (result.skipped.length > 0) {
        logger.log('\nSkipped (already exist):');
        for (const p of result.skipped) {
          logger.log(`  ${p}`);
        }
      }

      // Check if legal pages are missing and offer to add them
      const privacyExists = existsSync(path.join(reinitProjectPaths.root, 'pages', 'privacy', 'index.md'));
      const termsExists = existsSync(path.join(reinitProjectPaths.root, 'pages', 'terms', 'index.md'));
      if (!privacyExists || !termsExists) {
        logger.log('\nLegal pages not found.');
        const legalChoice = await promptLegalPagesChoice();
        const reinitConfig = await loadProjectConfig(reinitProjectPaths.root);
        if (legalChoice.mode === 'builtin') {
          const siteName = reinitConfig?.title || selectedProject;
          const siteUrl = reinitConfig?.url || 'https://example.com';
          const legalResult = await createBuiltinLegalPages(reinitProjectPaths.root, siteName, siteUrl);
          if (legalResult.created.length > 0) {
            logger.log(`Created legal pages: ${legalResult.created.join(', ')}`);
          }
        }
        if (legalChoice.mode !== 'none' && reinitConfig) {
          if (!reinitConfig.publish_to_local_folder) {
            reinitConfig.publish_to_local_folder = { enabled: false, path: '', content_subfolder: 'articles', assets_subfolder: 'assets', template_settings: {} };
          }
          const ts = (reinitConfig.publish_to_local_folder.template_settings || {}) as Record<string, any>;
          if (!ts.footer) ts.footer = {};
          ts.footer.columns = getLegalFooterColumns(legalChoice);
          reinitConfig.publish_to_local_folder.template_settings = ts;
          await saveProjectConfig(reinitProjectPaths.root, reinitConfig);
          logger.log('Updated footer configuration.');
        }
      }

      logger.log(`\nDone. ${result.created.length} files created, ${result.skipped.length} skipped.`);
      await pressEnterToContinue();
      continue;
    }

    // Handle article-seed (local action - no API call)
    if (finalAction === 'article-seed') {
      // Project selection
      const selectedProject = await selectProject();
      if (!selectedProject) {
        continue; // Back to action menu
      }

      if (selectedProject === CREATE_NEW_PROJECT) {
        logger.log('Please create a project first with project-init.');
        await pressEnterToContinue();
        continue;
      }

      const filledArgs = await promptForMissingArgs('article-seed', { path: selectedProject });
      const title = filledArgs.title as string;

      if (!title) {
        logger.log('No title provided.');
        await pressEnterToContinue();
        continue;
      }

      // Generate path from title
      const articlePath = (filledArgs.path as string) || title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);

      const projectPaths = getProjectPaths(selectedProject);

      // Check if article already exists
      if (await articleFolderExists(projectPaths.drafts, articlePath)) {
        logger.log(`Article '${articlePath}' already exists in ${selectedProject}`);
        await pressEnterToContinue();
        continue;
      }

      // Create article metadata (no last_pipeline = seed article)
      const now = new Date().toISOString();
      const meta: IArticle = {
        title,
        keywords: filledArgs.keywords
          ? (filledArgs.keywords as string).split(',').map((k: string) => k.trim())
          : [],
        version: 0,
        created_at: now,
        updated_at: now,
      };

      // Create brief content template
      const briefContent = [
        `# ${title}`,
        '',
        '## Must Cover',
        '<!-- Add specific topics that MUST be included -->',
        '',
        '## Examples to Include',
        '<!-- Add real-world examples, case studies, or data -->',
        '',
        '## Notes',
        '<!-- Add any additional notes or requirements -->',
        '',
      ].join('\n');

      try {
        await createArticleFolder(projectPaths.drafts, articlePath, meta, briefContent);
        logger.log('');
        logger.log(`✓ Seed article created: ${articlePath}`);
        logger.log(`  ${path.join(projectPaths.drafts, articlePath)}`);
        logger.log('');
        logger.log('Next: Run generate to write the full article.');
        logger.log('');
        await pressEnterToContinue();
        continue;
      } catch (error) {
        logger.log(`Failed to create article: ${error instanceof Error ? error.message : 'Unknown error'}`);
        await pressEnterToContinue();
        continue;
      }
    }

    // Handle publish (unified: list projects, pick one, auto-detect method)
    if (finalAction === 'publish') {
      const { listLocalPublishProjects, getLocalPublishTemplate, publishToLocalFolder, getPublishMethod } = await import('./lib/local-publish.js');
      const { loadProjectConfig } = await import('./lib/project-config.js');

      const projects = await listLocalPublishProjects();

      if (projects.length === 0) {
        logger.log('');
        logger.log('No projects have local folder publishing enabled.');
        logger.log('');
        logger.log('To enable, add this to a project\'s index.json:');
        logger.log('');
        logger.log(getLocalPublishTemplate());
        logger.log('');
        await pressEnterToContinue();
        continue;
      }

      // Display project list with method and target path
      logger.log('');
      logger.log(chalk.bold('=== Publish to Local Folder ==='));
      logger.log('');
      const maxName = Math.max(...projects.map(p => p.projectName.length));
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        const method = getPublishMethod(p.config);
        const num = `${i + 1}.`.padEnd(4);
        const name = p.projectName.padEnd(maxName + 2);
        const tag = `[${method}]`.padEnd(12);
        logger.log(`  ${num}${name}${tag}→ ${p.config.path}`);
      }
      logger.log('');

      // Prompt user to pick a project
      const rl = (await import('readline')).createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>(resolve => {
        rl.question('Select project (number or name, empty to cancel): ', resolve);
      });
      rl.close();

      const trimmed = answer.trim();
      if (!trimmed) {
        continue;
      }

      // Resolve selection by number or name
      let selected: typeof projects[0] | undefined;
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= projects.length) {
        selected = projects[num - 1];
      } else {
        selected = projects.find(p => p.projectName === trimmed);
      }

      if (!selected) {
        logger.log(`Project not found: ${trimmed}`);
        await pressEnterToContinue();
        continue;
      }

      const projectPaths = getProjectPaths(selected.projectName);
      const projectConfig = await loadProjectConfig(projectPaths.root);
      const method = getPublishMethod(selected.config);

      try {
        logger.log(`\nPublishing ${selected.projectName} [${method}] → ${selected.config.path}...`);
        logger.log('');

        const result = await publishToLocalFolder(
          projectPaths.root,
          selected.config,
          logger,
          projectConfig || undefined,
        );

        logger.log('');
        logger.log(`✓ ${result.articlesPublished} article(s) published`);
        logger.log(`  Assets: ${result.assetsCopied} copied`);
        logger.log(`  Target: ${selected.config.path}`);
        if (result.errors.length > 0) {
          logger.log(`  Errors: ${result.errors.length}`);
          for (const err of result.errors) {
            logger.log(`    ✗ ${err.file}: ${err.error}`);
          }
        }
        logger.log('');
      } catch (error) {
        logger.log('');
        logger.log(`✗ Publish failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        logger.log(`  Project folder: ${projectPaths.root}`);
        logger.log(`  Config file:    ${projectPaths.root}/index.json`);
        logger.log(`  Settings:       ${JSON.stringify(selected.config, null, 2)}`);
        logger.log('');
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle wb-preview (build and preview published articles as website)
    if (finalAction === 'wb-preview') {
      const { runWebsitePreview } = await import('./lib/wb-preview.js');
      const { loadProjectConfig } = await import('./lib/project-config.js');

      // Project selection
      const selectedProject = await selectProject();
      if (!selectedProject) {
        continue; // Back to action menu
      }

      if (selectedProject === CREATE_NEW_PROJECT) {
        logger.log('Please create a project first with project-init.');
        await pressEnterToContinue();
        continue;
      }

      const projectPaths = getProjectPaths(selectedProject);
      const projectConfig = await loadProjectConfig(projectPaths.root);

      // Run preview
      const result = await runWebsitePreview({
        projectRoot: projectPaths.root,
        projectName: selectedProject,
        projectConfig: projectConfig || undefined,
        logger,
      });

      // Output result
      if (result.success) {
        logger.log(chalk.green('\n✓ Website built successfully!'));
        logger.log(chalk.white(`  Output: ${result.path}`));
        logger.log(chalk.cyan('\nTo preview, run:'));
        logger.log(chalk.white(`  npx serve ${result.path}`));
      } else {
        logger.log(chalk.red(`\n✗ Build failed: ${result.error}`));
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle wb-build (build website locally without API server)
    if (finalAction === 'wb-build') {
      const { buildWebsiteLocal } = await import('./lib/wb-build.js');
      const { loadProjectConfig } = await import('./lib/project-config.js');

      // Project selection
      const selectedProject = await selectProject();
      if (!selectedProject) {
        continue; // Back to action menu
      }

      if (selectedProject === CREATE_NEW_PROJECT) {
        logger.log('Please create a project first with project-init.');
        await pressEnterToContinue();
        continue;
      }

      const projectPaths = getProjectPaths(selectedProject);
      const projectConfig = await loadProjectConfig(projectPaths.root);

      // Run local build
      const result = await buildWebsiteLocal({
        projectRoot: projectPaths.root,
        projectName: selectedProject,
        projectConfig: projectConfig || undefined,
        logger,
      });

      // Output result
      if (result.success) {
        logger.log(chalk.green('\n✓ Website built successfully!'));
        logger.log(chalk.white(`  Output: ${result.path}`));
        if (result.articlesCount !== undefined) {
          logger.log(chalk.white(`  Articles: ${result.articlesCount}`));
        }
        if (result.pagesCount !== undefined) {
          logger.log(chalk.white(`  Pages: ${result.pagesCount}`));
        }
        logger.log(chalk.cyan('\nTo preview, run:'));
        logger.log(chalk.white(`  npx serve ${result.path}`));
      } else {
        logger.log(chalk.red(`\n✗ Build failed: ${result.error}`));
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle force-enhance (re-run actions on enhanced articles)
    if (finalAction === 'force-enhance') {
      const selectedProject = await selectProject();
      if (!selectedProject || selectedProject === CREATE_NEW_PROJECT) {
        if (selectedProject === CREATE_NEW_PROJECT) {
          logger.log('Please create a project first with project-init.');
          await pressEnterToContinue();
        }
        continue;
      }

      // Get selection from force-enhance prompt (articles + action)
      const selection = await selectArticlesForForceEnhance(selectedProject, baseUrl);
      if (!selection) {
        await pressEnterToContinue();
        continue;
      }

      const { articlePaths, action } = selection;
      const projectPaths = getProjectPaths(selectedProject);

      logger.log(`\n[Force-Enhance] Running '${action}' on ${articlePaths.length} article(s)...\n`);

      let totalTokens = 0;
      let totalCost = 0;
      const batchResults: Array<{
        path: string;
        title: string;
        success: boolean;
        error?: string;
      }> = [];

      // Process each article with force flag
      for (let i = 0; i < articlePaths.length; i++) {
        const articlePath = articlePaths[i];
        // Enhanced articles are in drafts/ folder
        const absoluteFilePath = path.join(projectPaths.drafts, articlePath, 'content.md');

        logger.log(`[${i + 1}/${articlePaths.length}] ${articlePath}...`);

        // Execute enhance action with force flag
        const result = await executor.executeAction('enhance', `${selectedProject}/${articlePath}`, {
          mode: action,
          force: true,
        }, { debug: debugEnabled });

        if (result.success) {
          totalTokens += result.tokensUsed || 0;
          totalCost += result.costUsd || 0;
          logger.log(`  DONE ($${(result.costUsd || 0).toFixed(4)}) → ${absoluteFilePath}`);
          batchResults.push({ path: articlePath, title: articlePath, success: true });
        } else {
          logger.log(`  FAILED: ${result.error}`);
          batchResults.push({ path: articlePath, title: articlePath, success: false, error: result.error });
        }
      }

      // Display summary
      displayBatchSummary(batchResults, totalTokens, totalCost, projectPaths.root);

      // Send iTerm2 notification
      const successCount = batchResults.filter(r => r.success).length;
      process.stdout.write(`\x1b]9;Force-enhance: ${successCount}/${batchResults.length} articles ($${totalCost.toFixed(2)})\x07`);

      await pressEnterToContinue();
      continue;
    }

    // Handle migrate (local action - migrate project to unified format)
    if (finalAction === 'migrate') {
      const selectedProject = await selectProject();
      if (!selectedProject || selectedProject === CREATE_NEW_PROJECT) {
        if (selectedProject === CREATE_NEW_PROJECT) {
          logger.log('Please create a project first with project-init.');
          await pressEnterToContinue();
        }
        continue;
      }

      logger.log(`\nChecking migration status for: ${selectedProject}\n`);

      // Check if migration is needed
      const checkResult = await checkMigrationNeeded(selectedProject);

      if (!checkResult.projectConfig && checkResult.articleCount === 0) {
        logger.log(chalk.green('✓ Project is already using the unified format (index.json).'));
        logger.log('  No migration needed.');
        await pressEnterToContinue();
        continue;
      }

      logger.log('Migration needed:');
      if (checkResult.projectConfig) {
        logger.log(`  • Project config: _project.json → index.json`);
      }
      if (checkResult.articleCount > 0) {
        logger.log(`  • Articles: ${checkResult.articleCount} folder(s) with meta.json`);
      }
      logger.log('');

      // Run migration
      const result = await migrateToUnifiedFormat(selectedProject);

      logger.log('');
      logger.log(chalk.green('Migration complete!'));
      logger.log(`  Project config: ${result.project.migrated ? 'migrated' : 'skipped'}`);
      logger.log(`  Articles migrated: ${result.articles.migrated}`);
      logger.log(`  Articles skipped: ${result.articles.skipped}`);
      if (result.articles.errors.length > 0) {
        logger.log(chalk.red(`  Errors: ${result.articles.errors.length}`));
        for (const err of result.articles.errors) {
          logger.log(`    - ${err.path}: ${err.error}`);
        }
      }
      logger.log('');

      await pressEnterToContinue();
      continue;
    }

    // Handle migrate-faq (extract FAQ from content to faq.md)
    if (finalAction === 'migrate-faq') {
      const selectedProject = await selectProject();
      if (!selectedProject || selectedProject === CREATE_NEW_PROJECT) {
        if (selectedProject === CREATE_NEW_PROJECT) {
          logger.log('Please create a project first with project-init.');
          await pressEnterToContinue();
        }
        continue;
      }

      logger.log(`\nExtracting FAQ from content for: ${selectedProject}`);

      const result = await migrateFaqFromContentProject(selectedProject);

      logger.log('');
      logger.log(chalk.green('Migration complete!'));
      logger.log(`  FAQ extracted: ${result.faqMigrated}`);
      logger.log(`  Skipped (no FAQ): ${result.skipped}`);
      if (result.errors.length > 0) {
        logger.log(chalk.red(`  Errors: ${result.errors.length}`));
        for (const err of result.errors) {
          logger.log(`    - ${err.path}: ${err.error}`);
        }
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle migrate-jsonld (extract JSON-LD from content to jsonld.md)
    if (finalAction === 'migrate-jsonld') {
      const selectedProject = await selectProject();
      if (!selectedProject || selectedProject === CREATE_NEW_PROJECT) {
        if (selectedProject === CREATE_NEW_PROJECT) {
          logger.log('Please create a project first with project-init.');
          await pressEnterToContinue();
        }
        continue;
      }

      logger.log(`\nExtracting JSON-LD from content for: ${selectedProject}`);

      const result = await migrateJsonldFromContentProject(selectedProject);

      logger.log('');
      logger.log(chalk.green('Migration complete!'));
      logger.log(`  JSON-LD extracted: ${result.jsonldMigrated}`);
      logger.log(`  Skipped (no JSON-LD): ${result.skipped}`);
      if (result.errors.length > 0) {
        logger.log(chalk.red(`  Errors: ${result.errors.length}`));
        for (const err of result.errors) {
          logger.log(`    - ${err.path}: ${err.error}`);
        }
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle migrate-content (extract both FAQ and JSON-LD from content)
    if (finalAction === 'migrate-content') {
      const selectedProject = await selectProject();
      if (!selectedProject || selectedProject === CREATE_NEW_PROJECT) {
        if (selectedProject === CREATE_NEW_PROJECT) {
          logger.log('Please create a project first with project-init.');
          await pressEnterToContinue();
        }
        continue;
      }

      logger.log(`\nExtracting FAQ and JSON-LD from content for: ${selectedProject}`);

      const result = await migrateContentExtractAllProject(selectedProject);

      logger.log('');
      logger.log(chalk.green('Migration complete!'));
      logger.log(`  Total articles: ${result.total}`);
      logger.log(`  FAQ extracted: ${result.faqMigrated}`);
      logger.log(`  JSON-LD extracted: ${result.jsonldMigrated}`);
      logger.log(`  Skipped (no FAQ/JSON-LD): ${result.skipped}`);
      if (result.errors.length > 0) {
        logger.log(chalk.red(`  Errors: ${result.errors.length}`));
        for (const err of result.errors) {
          logger.log(`    - ${err.path}: ${err.error}`);
        }
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle migrate-published-at (backfill published_at from updated_at)
    if (finalAction === 'migrate-published-at') {
      const selectedProject = await selectProject();
      if (!selectedProject || selectedProject === CREATE_NEW_PROJECT) {
        if (selectedProject === CREATE_NEW_PROJECT) {
          logger.log('Please create a project first with project-init.');
          await pressEnterToContinue();
        }
        continue;
      }

      logger.log(`\nBackfilling published_at from updated_at for: ${selectedProject}`);

      const result = await migrateBackfillPublishedAt(selectedProject);

      logger.log('');
      logger.log(chalk.green('Migration complete!'));
      logger.log(`  Total articles: ${result.total}`);
      logger.log(`  Backfilled: ${result.migrated}`);
      logger.log(`  Skipped (already set): ${result.skipped}`);
      if (result.errors.length > 0) {
        logger.log(chalk.red(`  Errors: ${result.errors.length}`));
        for (const err of result.errors) {
          logger.log(`    - ${err.path}: ${err.error}`);
        }
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle pipeline-verify (verify pipeline state & applied actions)
    if (finalAction === 'pipeline-verify') {
      const selectedProject = await selectProject();
      if (!selectedProject || selectedProject === CREATE_NEW_PROJECT) {
        if (selectedProject === CREATE_NEW_PROJECT) {
          logger.log('Please create a project first with project-init.');
          await pressEnterToContinue();
        }
        continue;
      }

      logger.log(`\nVerifying pipeline state for: ${selectedProject}\n`);

      try {
        const result = await verifyProject(selectedProject);

        logger.log(`Total articles: ${result.totalArticles}  |  Valid: ${result.validArticles}  |  Invalid: ${result.invalidArticles}`);

        if (result.invalidArticles === 0) {
          logger.log(chalk.green('\n✓ All articles have complete pipeline actions.'));
          await pressEnterToContinue();
          continue;
        }

        logger.log('\nArticles with incomplete pipeline actions:\n');

        for (const r of result.results) {
          logger.log(`  ${r.articlePath}`);
          logger.log(`    File: ${path.join(r.absolutePath, 'index.json')}`);
          logger.log(`    Pipeline: ${r.lastPipeline} (expected ${r.expectedActions.length} actions, applied ${r.appliedActions.length})`);
          logger.log(`    Missing: ${r.missingActions.join(', ')}`);
          logger.log('');
        }

        if (flags.fix) {
          const fixedCount = await fixArticles(result.results, selectedProject);
          logger.log(chalk.green(`\nFixed ${fixedCount} article(s). They can now be re-processed by the enhance pipeline.`));
        } else {
          const shouldFix = await confirm(`Fix ${result.invalidArticles} article(s) by reverting last_pipeline to previous state?`, false);
          if (shouldFix) {
            const fixedCount = await fixArticles(result.results, selectedProject);
            logger.log(chalk.green(`\nFixed ${fixedCount} article(s). They can now be re-processed by the enhance pipeline.`));
          } else {
            logger.log('\nFix skipped.');
          }
        }
      } catch (error: any) {
        logger.log(chalk.red(`Error: ${error.message}`));
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle assets-cleanup (find and remove unreferenced article assets)
    if (finalAction === 'assets-cleanup') {
      const selectedProject = await selectProject();
      if (!selectedProject || selectedProject === CREATE_NEW_PROJECT) {
        if (selectedProject === CREATE_NEW_PROJECT) {
          logger.log('Please create a project first with project-init.');
          await pressEnterToContinue();
        }
        continue;
      }

      logger.log(`\nScanning assets for: ${selectedProject}\n`);

      try {
        const result = await findOrphanedAssets(selectedProject);

        logger.log(`Articles: ${result.totalArticles} total, ${result.articlesScanned} with assets`);
        logger.log(`Orphaned: ${result.orphanedAssets.length} file(s) in ${result.articlesWithOrphans} article(s) (${formatBytes(result.totalOrphanedBytes)})\n`);

        if (result.orphanedAssets.length === 0) {
          logger.log(chalk.green('✓ No orphaned assets found.'));
        } else {
          // Group by assetsDir for display
          const byAssetsDir = new Map<string, typeof result.orphanedAssets>();
          for (const asset of result.orphanedAssets) {
            const list = byAssetsDir.get(asset.assetsDir) || [];
            list.push(asset);
            byAssetsDir.set(asset.assetsDir, list);
          }

          for (const [assetsDir, assets] of byAssetsDir) {
            logger.log(`  ${assetsDir}/`);
            for (const asset of assets) {
              logger.log(`    ${asset.fileName}  (${formatBytes(asset.size)})`);
            }
            logger.log('');
          }

          const shouldRemove = await confirm(
            `Remove ${result.orphanedAssets.length} orphaned file(s)?`,
            false
          );

          if (shouldRemove) {
            const removed = await removeAssets(result.orphanedAssets);
            logger.log(chalk.green(`\nRemoved ${removed} file(s).`));
          } else {
            logger.log('\nRemoval skipped.');
          }
        }

        // Phase 2: Legacy "index" field cleanup
        const legacyArticles = await findLegacyIndexFields(selectedProject);
        if (legacyArticles.length > 0) {
          const removeCount = legacyArticles.filter(a => a.action === 'remove_index').length;
          const renameCount = legacyArticles.filter(a => a.action === 'rename_index_to_content').length;

          logger.log(`\nLegacy "index" field found in ${legacyArticles.length} article(s):`);
          if (removeCount) logger.log(`  ${removeCount} with both index+content (will remove index)`);
          if (renameCount) logger.log(`  ${renameCount} with index only (will rename to content)`);

          for (const article of legacyArticles) {
            logger.log(`  ${article.articlePath} → ${article.action === 'remove_index' ? 'remove index' : 'rename index→content'}`);
          }

          const shouldFix = await confirm(`Fix ${legacyArticles.length} article(s)?`, false);
          if (shouldFix) {
            const fixed = await fixLegacyIndexFields(legacyArticles);
            logger.log(chalk.green(`Fixed ${fixed} article(s).`));
          }
        }
      } catch (error: any) {
        logger.log(chalk.red(`Error: ${error.message}`));
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle ideas (AI-expand ideas into content plan and import)
    if (finalAction === 'ideas') {
      // Step 1: Select project
      const selectedProject = await selectProject();
      if (!selectedProject) {
        continue;
      }

      if (selectedProject === CREATE_NEW_PROJECT) {
        logger.log('Please create a project first with project-init.');
        await pressEnterToContinue();
        continue;
      }

      // Step 2: Get ideas input
      const ideasText = await promptMultilineInput('Enter your article ideas (one per line, free-form):');
      if (!ideasText) {
        await pressEnterToContinue();
        continue;
      }

      // Parse ideas: split by newline, filter empty
      const ideas = ideasText.split('\n').map((l) => l.trim()).filter(Boolean);
      if (ideas.length === 0) {
        logger.log('No ideas provided.');
        await pressEnterToContinue();
        continue;
      }

      const projectPaths = getProjectPaths(selectedProject);

      try {
        // Step 3: Read project config for website context
        const { loadProjectConfig } = await import('./lib/project-config.js');
        const projectConfig = await loadProjectConfig(projectPaths.root);
        if (!projectConfig) {
          logger.log('Project config (index.json) not found. Run project-init first.');
          await pressEnterToContinue();
          continue;
        }

        // Build website_info from project config
        const websiteInfo = {
          title: projectConfig.title || selectedProject,
          url: projectConfig.url || '',
          description: (projectConfig as any).description || '',
          focus_keywords: (projectConfig as any).focus_keywords || '',
          focus_instruction: (projectConfig as any).focus_instruction || '',
        };

        logger.log(`\nExpanding ${ideas.length} idea(s) for ${selectedProject} via AI...`);

        // Step 4: Call sgen expand-ideas endpoint
        const result = await executor.expandIdeas(ideas, websiteInfo);

        if (!result.success || !result.plan) {
          logger.log(`\nExpansion failed: ${result.error || 'Unknown error'}`);
          await pressEnterToContinue();
          continue;
        }

        // Step 5: Display expanded plan
        const planText = planToSimpleText(result.plan);
        logger.log('');
        logger.log(chalk.bold('=== Expanded Content Plan ==='));
        logger.log('');
        logger.log(planText);
        logger.log('');
        if (result.tokens_used) {
          logger.log(`Tokens used: ${result.tokens_used}`);
        }
        if (result.cost_usd) {
          logger.log(`Cost: $${result.cost_usd.toFixed(4)}`);
        }
        logger.log('');

        // Step 6: Confirm import
        const shouldImport = await confirm(`Import ${result.plan.items.length} article(s) as drafts?`, true);
        if (!shouldImport) {
          logger.log('Import cancelled.');
          await pressEnterToContinue();
          continue;
        }

        // Step 7: Parse the plan text back through simplePlanToPlan for import
        const parseResult = simplePlanToPlan(planText, 'AI-expanded ideas');

        // Step 8: Analyze conflicts
        const preview = await analyzeImport(projectPaths.root, parseResult.plan);

        // Step 9: Display preview
        displayImportPreview(preview);

        // Step 10: Resolve conflicts interactively
        const conflicts = preview.filter((p) => p.conflict !== 'new');
        const resolved = new Map<string, string | 'skip' | 'fail'>();

        if (conflicts.length > 0) {
          const interactiveResolved = await resolveConflictsInteractive(
            conflicts.map((c) => ({
              title: c.title,
              articlePath: c.articlePath,
              conflict: c.conflict as 'seed_replace' | 'skip',
              existingPipeline: c.existingPipeline,
            }))
          );
          for (const [key, value] of interactiveResolved) {
            resolved.set(key, value);
          }
        }

        // Step 11: Execute import
        const importResult = await executeResolvedImport(
          projectPaths.root,
          parseResult.plan,
          preview,
          resolved,
          {}
        );

        // Step 12: Print results
        logger.log('');
        logger.log('Import results:');
        logger.log(`  Created: ${importResult.created} article(s)`);
        if (importResult.updated > 0) {
          logger.log(`  Updated: ${importResult.updated} seed article(s)`);
        }
        if (importResult.skipped > 0) {
          logger.log(`  Skipped: ${importResult.skipped} article(s)`);
        }
        if (importResult.failed > 0) {
          logger.log(`  Failed: ${importResult.failed} article(s)`);
          for (const f of importResult.failures) {
            logger.log(`    - ${f.path}: ${f.reason}`);
          }
        }
        if (importResult.errors.length > 0) {
          logger.log(`  Errors: ${importResult.errors.length}`);
          for (const err of importResult.errors) {
            logger.log(`    - ${err.path}: ${err.error}`);
          }
        }
        logger.log('');
      } catch (error) {
        logger.log('');
        logger.log(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        logger.log('');
      }

      await pressEnterToContinue();
      continue;
    }

    // Handle plan-import (local action - no API call, no AI)
    if (finalAction === 'plan-import') {
      // Project selection
      const selectedProject = await selectProject();
      if (!selectedProject) {
        continue; // Back to action menu
      }

      if (selectedProject === CREATE_NEW_PROJECT) {
        logger.log('Please create a project first with project-init.');
        await pressEnterToContinue();
        continue;
      }

      // Prompt for input source (file or paste)
      let filePath = flags.file;
      let pastedContent: string | null = null;

      if (!filePath) {
        const source = await promptPlanImportSource();
        if (!source) {
          continue; // Back to action menu
        }

        if (source.paste) {
          // Get multiline input from terminal
          pastedContent = await promptMultilineInput('Paste your content plan below, then press Enter:');
          if (!pastedContent) {
            await pressEnterToContinue();
            continue;
          }
        } else {
          filePath = source.file;
        }
      }

      // Ensure we have either file or pasted content
      if (!filePath && !pastedContent) {
        logger.log('No input provided.');
        await pressEnterToContinue();
        continue;
      }

      const projectPaths = getProjectPaths(selectedProject);

      try {
        logger.log(`\nImporting content plan for ${selectedProject}...`);

        // Step 1: Parse content
        const parseResult = pastedContent
          ? simplePlanToPlan(pastedContent, 'terminal input')
          : await parsePlanFile(filePath!);

        // Print parse summary
        printParseSummary(parseResult, projectPaths.drafts);

        if (parseResult.plan.items.length === 0) {
          logger.log('No valid articles to import.');
          await pressEnterToContinue();
          continue;
        }

        // Step 2: Analyze conflicts
        const preview = await analyzeImport(projectPaths.root, parseResult.plan);

        // Step 3: Display preview
        displayImportPreview(preview);

        // Step 4: Detect if interactive mode (paste = interactive, file = non-interactive)
        const isInteractive = !filePath;

        // Step 5: Resolve conflicts based on mode
        const conflicts = preview.filter((p) => p.conflict !== 'new');
        const resolved = new Map<string, string | 'skip' | 'fail'>();

        if (isInteractive && conflicts.length > 0) {
          // INTERACTIVE: Prompt for each conflict with editable suggested URL
          const interactiveResolved = await resolveConflictsInteractive(
            conflicts.map((c) => ({
              title: c.title,
              articlePath: c.articlePath,
              conflict: c.conflict as 'seed_replace' | 'skip',
              existingPipeline: c.existingPipeline,
            }))
          );
          // Transfer to main resolved map
          for (const [key, value] of interactiveResolved) {
            resolved.set(key, value);
          }
        } else if (conflicts.length > 0) {
          // NON-INTERACTIVE: Mark all conflicts as failed
          for (const c of conflicts) {
            resolved.set(c.articlePath, 'fail');
          }
        }

        // Step 6: Execute with resolved paths
        const result = await executeResolvedImport(
          projectPaths.root,
          parseResult.plan,
          preview,
          resolved,
          {}
        );

        // Step 7: Print import results
        logger.log('');
        logger.log(`Import results:`);
        logger.log(`  Created: ${result.created} article(s)`);
        if (result.updated > 0) {
          logger.log(`  Updated: ${result.updated} seed article(s) (old versions archived)`);
        }
        if (result.skipped > 0) {
          logger.log(`  Skipped: ${result.skipped} article(s)`);
        }
        if (result.failed > 0) {
          logger.log(`  Failed: ${result.failed} article(s)`);
          for (const f of result.failures) {
            logger.log(`    - ${f.path}: ${f.reason}`);
          }
        }
        if (result.errors.length > 0) {
          logger.log(`  Errors: ${result.errors.length}`);
          for (const err of result.errors) {
            logger.log(`    - ${err.path}: ${err.error}`);
          }
        }
        logger.log('');
      } catch (error) {
        logger.log('');
        logger.log(`✗ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        logger.log('');
      }

      await pressEnterToContinue();
      continue;
    }

    // Check if selected action is a pipeline (from API)
    const pipelineConfigResult = await executor.getPipelineConfig(finalAction);
    if (pipelineConfigResult.success && pipelineConfigResult.config) {
      const pipelineConfig = pipelineConfigResult.config;

      try {
        // Step 1: Project selection (if needsProject)
        let selectedProject: string | null = null;
        if (pipelineConfig.needsProject) {
          selectedProject = await selectProject();
          if (!selectedProject) {
            continue; // Back to action menu
          }

          if (selectedProject === CREATE_NEW_PROJECT) {
            logger.log('Please create a project first with project-init.');
            await pressEnterToContinue();
            continue;
          }
        }

        finalPath = selectedProject || '';

        // Sync missing action prompts from server (auto-sync)
        if (selectedProject) {
          try {
            const actionConfigResult = await executor.getActionConfig();
            if (actionConfigResult.success && actionConfigResult.config) {
              const projectPaths = getProjectPaths(selectedProject);
              const synced = await syncActionPrompts(projectPaths.root, actionConfigResult.config);
              if (synced.length > 0) {
                logger.log(`Synced ${synced.length} action file(s) from server`);
              }
            }
          } catch (err) {
            // Non-fatal: log and continue
            if (debug) {
              logger.log(`Action sync warning: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // Step 2: File input (if needsFileInput - for plan-import)
        if (pipelineConfig.needsFileInput) {
          const inputSource = await promptPlanImportSource();
          if (!inputSource) {
            continue; // Back to action menu
          }
          finalFlags = { ...finalFlags, ...inputSource };
        }

        // Step 3: Article selection (if articleFilter is set)
        let selectedPaths: string[] = [];
        if (pipelineConfig.articleFilter && selectedProject) {
          const resolved = resolvePath(selectedProject);
          const filter = pipelineConfig.articleFilter;

          // Get articles matching the filter
          let eligibleArticles;
          if (filter.last_pipeline === null) {
            // Seed articles (no last_pipeline)
            eligibleArticles = await getSeedArticles(resolved);
          } else {
            // Articles after a specific pipeline
            eligibleArticles = await getArticlesAfterPipeline(resolved, filter.last_pipeline);
          }

          if (eligibleArticles.length === 0) {
            const filterDesc = filter.last_pipeline === null
              ? 'seed articles (no last_pipeline)'
              : `articles with last_pipeline: ${filter.last_pipeline}`;
            logger.log(`\nNo articles ready for ${finalAction}. Need: ${filterDesc}`);
            await pressEnterToContinue();
            continue;
          }

          // Show article selection
          const selectionList: ArticleForSelection[] = eligibleArticles.map((a) => ({
            path: a.path,
            title: a.meta.title || a.path,
            created_at: a.meta.created_at || new Date().toISOString(),
            priority: a.meta.priority,
          }));

          // Use appropriate selection function based on pipeline
          if (filter.last_pipeline === null) {
            selectedPaths = await selectArticlesForGeneration(selectionList);
          } else {
            const selected = await selectArticlesForEnhancement(selectionList);
            selectedPaths = selected || [];
          }

          if (selectedPaths.length === 0) {
            continue; // Back to action menu
          }
        }

        // Step 4: Fetch sitemap for interlink-articles pipeline
        if (finalAction === 'interlink-articles' && selectedProject) {
          const projectPaths = getProjectPaths(selectedProject);
          const sitemapFile = path.join(projectPaths.root, 'sitemap.xml');
          const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

          let sitemapXml: string | undefined;

          // Check if cached sitemap exists and is fresh
          if (existsSync(sitemapFile)) {
            const stat = statSync(sitemapFile);
            const age = Date.now() - stat.mtimeMs;
            if (age < TTL_MS) {
              sitemapXml = readFileSync(sitemapFile, 'utf-8');
              logger.log(`Using cached sitemap (${Math.round(age / 3600000)}h old)`);
            }
          }

          // Fetch fresh if needed
          if (!sitemapXml) {
            const projectConfig = await import('./lib/path-resolver').then(m => m.getProjectConfig(resolvePath(selectedProject)));
            if (projectConfig?.url) {
              try {
                const sitemapUrl = `${projectConfig.url.replace(/\/$/, '')}/sitemap.xml`;
                logger.log(`Fetching sitemap: ${sitemapUrl}`);
                const res = await fetch(sitemapUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                sitemapXml = await res.text();
                writeFileSync(sitemapFile, sitemapXml, 'utf-8');
                logger.log(`Sitemap saved (${sitemapXml.length} bytes)`);
              } catch (err) {
                logger.log(`Warning: Could not fetch sitemap: ${err instanceof Error ? err.message : String(err)}`);
              }
            } else {
              logger.log('Warning: Project has no URL configured. Cannot fetch sitemap.');
            }
          }

          if (sitemapXml) {
            finalFlags.sitemap_xml = sitemapXml;
          } else {
            logger.log('Internal linking will not be available.');
          }
        }

        // Step 5: Run pipeline actions
        // Filter out disabled actions (enabled: false)
        let actions = pipelineConfig.actions
          .filter(a => a.enabled !== false)
          .map(a => a.action);

        // Apply per-project exclusions
        if (selectedProject) {
          const projectPathsForExclude = getProjectPaths(selectedProject);
          const excluded = loadExcludedActions(projectPathsForExclude.root, finalAction);
          actions = filterPipelineActions(actions, excluded, logger);
        }

        logger.log(`\nRunning ${finalAction} pipeline (${actions.length} steps) on ${selectedPaths.length || 1} item(s)`);

        let totalTokens = 0;
        let totalCost = 0;
        const batchResults: Array<{
          path: string;
          title: string;
          success: boolean;
          error?: string;
          wordCount?: number;
        }> = [];

        // For pipelines with articleFilter, process each article
        if (selectedPaths.length > 0 && selectedProject) {
          let batchStopped = false;

          for (let i = 0; i < selectedPaths.length; i++) {
            if (batchStopped) break;

            const articlePath = selectedPaths[i];
            const fullPath = `${selectedProject}/${articlePath}`;
            const absoluteFilePath = path.join(getProjectPaths(selectedProject).content, articlePath, 'content.md');

            logger.log(`\n[${i + 1}/${selectedPaths.length}] Processing: ${articlePath}`);
            logger.log(`  File: ${absoluteFilePath}`);

            let articleSuccess = true;
            for (let m = 0; m < actions.length; m++) {
              const currentAction = actions[m];

              // Check if action was already applied — skip for all action types (local and API)
              const localFolderPath = path.join(getProjectPaths(selectedProject!).content, articlePath);
              const actionMeta = await getArticleMeta(localFolderPath);
              if (actionMeta?.applied_actions?.includes(currentAction)) {
                logger.log(`  [${m + 1}/${actions.length}] ${currentAction} skipped (already applied)`);
                continue;
              }

              logger.log(`  [${m + 1}/${actions.length}] ${currentAction}...`);

              // Handle local-only modes (e.g., generate_image_social, verify_assets)
              if (isLocalMode(currentAction)) {
                if (currentAction === 'generate_image_social') {
                  const localResult = await generateImageSocialLocal(fullPath, logger);
                  if (localResult.success) {
                    logger.log(`  [${m + 1}/${actions.length}] ${currentAction} done (free)`);
                    if (localResult.count) await addAppliedAction(localFolderPath, currentAction);
                  } else {
                    logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${localResult.error}`);
                    articleSuccess = false;
                    break;
                  }
                } else if (currentAction === 'verify_assets') {
                  const localResult = await verifyAssetsLocal(fullPath, logger);
                  if (localResult.success) {
                    logger.log(`  [${m + 1}/${actions.length}] ${currentAction} done (${localResult.count || 0} verified)`);
                    if (localResult.count) await addAppliedAction(localFolderPath, currentAction);
                  } else {
                    logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${localResult.error}`);
                    articleSuccess = false;
                    break;
                  }
                } else if (currentAction === 'verify_links_and_sources') {
                  const localResult = await verifyLinksLocal(fullPath, logger);
                  if (localResult.success) {
                    logger.log(`  [${m + 1}/${actions.length}] ${currentAction} done (${localResult.count || 0} verified)`);
                    if (localResult.count) await addAppliedAction(localFolderPath, currentAction);
                  } else {
                    logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${localResult.error}`);
                    articleSuccess = false;
                    break;
                  }
                }
                continue;
              }

              // Execute action via API
              const result = await executor.executeAction(finalAction === 'generate' ? 'generate' : 'enhance', fullPath, { mode: currentAction, pipelineName: finalAction, ...finalFlags }, { debug: debugEnabled });

              if (result.success) {
                if (result.skipped) {
                  // Action was skipped (e.g., already applied) - log warning and continue
                  logger.log(`  [${m + 1}/${actions.length}] ${currentAction} SKIPPED (already applied)`);
                  await addAppliedAction(localFolderPath, currentAction);
                } else {
                  // Action executed successfully
                  totalTokens += result.tokensUsed || 0;
                  totalCost += result.costUsd || 0;
                  logger.log(`  [${m + 1}/${actions.length}] ${currentAction} DONE ($${(result.costUsd || 0).toFixed(4)}) → ${absoluteFilePath}`);

                  // Record the action in applied_actions
                  await addAppliedAction(localFolderPath, currentAction);
                }
              } else {
                logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${result.error}`);
                logger.log(`  File: ${absoluteFilePath}`);
                articleSuccess = false;
                break; // Stop pipeline on error
              }
            }

            // After all actions succeed, verify all pipeline actions are applied before updating last_pipeline
            if (articleSuccess && selectedProject) {
              const folderPath = path.join(getProjectPaths(selectedProject).content, articlePath);

              // Read current article metadata to check applied_actions
              const articleMeta = await getArticleMeta(folderPath);
              const appliedActions = articleMeta?.applied_actions || [];

              // Check if all pipeline actions are in applied_actions
              const missingActions = actions.filter(action => !appliedActions.includes(action));

              if (missingActions.length > 0) {
                logger.log(`  ⚠ Pipeline incomplete: missing actions [${missingActions.join(', ')}]`);
                logger.log(`  → last_pipeline NOT updated (still: ${articleMeta?.last_pipeline || 'null'})`);
                articleSuccess = false;
              } else {
                // All actions applied - safe to update last_pipeline
                await updateArticleMeta(folderPath, { last_pipeline: finalAction });
              }
            }

            batchResults.push({
              path: articlePath,
              title: articlePath,
              success: articleSuccess,
              error: articleSuccess ? undefined : 'Pipeline failed',
            });

            // Stop entire batch on first article failure
            if (!articleSuccess) {
              batchStopped = true;
            }
          }

          if (batchStopped) {
            logger.log(`\n❌ Batch stopped due to error. Fix the issue and retry.`);
          }

          const projectPaths = getProjectPaths(selectedProject);
          displayBatchSummary(batchResults, totalTokens, totalCost, projectPaths.root);
        } else {
          // For pipelines without articleFilter (e.g., plan-import)
          for (let m = 0; m < actions.length; m++) {
            const currentAction = actions[m];
            logger.log(`  [${m + 1}/${actions.length}] ${currentAction}...`);

            const result = await executor.executeAction(finalAction, finalPath, { mode: currentAction, ...finalFlags }, { debug: debugEnabled });

            if (result.success) {
              if (result.skipped) {
                // Action was skipped (e.g., already applied) - log warning and continue
                logger.log(`  [${m + 1}/${actions.length}] ${currentAction} SKIPPED (already applied)`);
              } else {
                totalTokens += result.tokensUsed || 0;
                totalCost += result.costUsd || 0;
                logger.log(`  [${m + 1}/${actions.length}] ${currentAction} done`);
                if (result.message) {
                  logger.log(`  ${result.message}`);
                }
              }
            } else {
              logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${result.error}`);
              break; // Stop pipeline on error
            }
          }

          if (totalTokens > 0 || totalCost > 0) {
            logger.log(`\nTotal: ${totalTokens} tokens, $${totalCost.toFixed(4)}`);
          }
        }

        // Send iTerm2 notification (triggers macOS notification if iTerm2 is configured)
        process.stdout.write(`\x1b]9;Pipeline ${finalAction} complete ($${totalCost.toFixed(2)})\x07`);

        await pressEnterToContinue();
        continue; // Back to action menu

      } catch (err) {
        if (debug) {
          logger.log(`Pipeline ${finalAction}: ${err instanceof Error ? err.message : String(err)}`);
        }
        await pressEnterToContinue();
        continue;
      }
    }

    // Handle other actions (status, etc.) via API
    const allArgs = { ...finalFlags };
    if (finalPath) allArgs.path = finalPath;
    const filledArgs = await promptForMissingArgs(finalAction, allArgs);
    if (filledArgs.path && !finalPath) {
      finalPath = filledArgs.path;
      delete filledArgs.path;
    }
    finalFlags = filledArgs;

    const result = await executor.executeAction(finalAction, finalPath, finalFlags, { debug: debugEnabled });

    if (result.success) {
      if (result.message) {
        logger.log(result.message);
      }
      if (result.tokensUsed || result.costUsd) {
        logger.log(`Tokens: ${result.tokensUsed || 0}, Cost: $${(result.costUsd || 0).toFixed(4)}`);
      }
    } else {
      logger.log(`Error: ${result.error || 'Action failed'}`);
    }

    await pressEnterToContinue();
    // Loop continues back to action menu
  }

  // Non-interactive mode (action provided on command line)
  if (!finalAction) {
    printHelp();
    process.exit(0);
  }

  // Handle list-actions
  if (finalAction === 'list-actions') {
    const result = await executor.listActions();
    if (!result.success) {
      outputError(result.error || 'Failed to fetch actions', 'API_ERROR');
      process.exit(1);
    }
    printActions(result.actions || []);
    process.exit(0);
  }

  // Handle project-init locally (no API call needed for project creation)
  if (finalAction === 'project-init') {
    // Get project name from flags
    const projectName = finalFlags.name as string | undefined;

    if (!projectName) {
      outputError('Project name is required. Use --name <project-name>', 'MISSING_ARG');
      process.exit(1);
    }

    // Sanitize project name (remove special characters, spaces to dashes)
    const sanitizedName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!sanitizedName) {
      outputError('Invalid project name. Use alphanumeric characters, dashes, or dots.', 'INVALID_NAME');
      process.exit(1);
    }

    const projectDir = getUserProjectDir(sanitizedName);

    // Check if project already exists
    if (existsSync(projectDir)) {
      outputError(`Project '${sanitizedName}' already exists at ${projectDir}`, 'PROJECT_EXISTS');
      process.exit(1);
    }

    try {
      // Create project folder structure
      logger.log(`Creating project '${sanitizedName}'...`);

      // Derive URL from project name if it looks like a domain (contains a dot)
      // Store just the domain without https:// prefix (sgen will normalize)
      const projectUrl = sanitizedName.includes('.')
        ? sanitizedName
        : undefined;

      await initializeProject(projectDir, {
        title: projectName, // Use original name as title
        url: projectUrl,
      });

      // Apply project template defaults (branding, colors)
      logger.log('Applying project template defaults...');
      const cliStyle = finalFlags.style as string | undefined;
      await mergeProjectTemplateDefaults(projectDir, {
        illustrationStyle: cliStyle || undefined,
      });

      // Copy default prompts/write_draft/custom.md from bundled template
      logger.log('Applying default requirements template...');
      await initializePromptTemplates(projectDir);

      // Initialize default action configs
      logger.log('Initializing default action configs...');
      const actionConfigResult = await executor.getActionConfig();
      if (actionConfigResult.success && actionConfigResult.config) {
        const { reinitProject, formatCreatedFilesOutput } = await import('./lib/project-reinit');
        const reinitResult = await reinitProject(sanitizedName, actionConfigResult.config);
        if (reinitResult.created.length > 0) {
          formatCreatedFilesOutput(reinitResult.created, logger, projectDir);
        }
      }

      logger.log('');
      logger.log(`✓ Project '${sanitizedName}' created!`);
      logger.log(`  Settings: ${path.join(projectDir, 'index.json')}`);
      logger.log('');
      logger.log('Next steps:');
      logger.log(`  1. Edit prompt templates in: ${path.join(projectDir, 'config', 'actions')}/`);
      logger.log('');
      logger.log(`  2. Import a content plan or add articles:`);
      logger.log(`     blogpostgen plan-import ${sanitizedName} --file plan.txt`);
      logger.log(`     blogpostgen plan-add ${sanitizedName} --title "Your Article Title"`);
      logger.log('');

      process.exit(0);
    } catch (error) {
      outputError(
        error instanceof Error ? error.message : 'Failed to create project',
        'PROJECT_INIT_ERROR'
      );
      process.exit(1);
    }
  }

  // Non-interactive TTY project selection - show project picker when:
  // 1. Action is 'generate'
  // 2. No path provided
  // 3. stdin is TTY (non-interactive mode only, interactive handled by loop above)
  if (finalAction === 'generate' && !finalPath && process.stdin.isTTY) {
    const selectedProject = await selectProject();
    if (!selectedProject) {
      logger.log('No project selected. Exiting.');
      process.exit(0);
    }
    // If user wants to create a new project, switch to project-init action
    if (selectedProject === CREATE_NEW_PROJECT) {
      finalAction = 'project-init';
      // The project-init handler above will be executed on next iteration
      // But we've already passed it, so we need to handle it here
      const filledArgs = await promptForMissingArgs('project-init', {});
      const projectName = filledArgs.name as string;

      if (!projectName) {
        logger.log('No project name provided. Exiting.');
        process.exit(0);
      }

      // Run project-init inline
      const sanitizedName = projectName
        .toLowerCase()
        .replace(/[^a-z0-9-_.]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (!sanitizedName) {
        outputError('Invalid project name. Use alphanumeric characters, dashes, or dots.', 'INVALID_NAME');
        process.exit(1);
      }

      const projectDir = getUserProjectDir(sanitizedName);

      if (existsSync(projectDir)) {
        outputError(`Project '${sanitizedName}' already exists`, 'PROJECT_EXISTS');
        process.exit(1);
      }

      try {
        logger.log(`Creating project '${sanitizedName}'...`);

        // Derive URL from project name if it looks like a domain (contains a dot)
        // Store just the domain without https:// prefix (sgen will normalize)
        const projectUrl = sanitizedName.includes('.')
          ? sanitizedName
          : undefined;

        // Pick illustration style for hero images
        const inlineIllustrationStyle = await selectIllustrationStyle();

        await initializeProject(projectDir, { title: projectName, url: projectUrl });
        logger.log('Applying project template defaults...');
        await mergeProjectTemplateDefaults(projectDir, {
          illustrationStyle: inlineIllustrationStyle || undefined,
        });
        logger.log('Applying default requirements template...');
        await initializePromptTemplates(projectDir);

        // Initialize default action configs
        logger.log('Initializing default action configs...');
        const actionConfigResult = await executor.getActionConfig();
        if (actionConfigResult.success && actionConfigResult.config) {
          const { reinitProject, formatCreatedFilesOutput } = await import('./lib/project-reinit');
          const reinitResult = await reinitProject(sanitizedName, actionConfigResult.config);
          if (reinitResult.created.length > 0) {
            formatCreatedFilesOutput(reinitResult.created, logger, projectDir);
          }
        }

        logger.log('');
        logger.log(`✓ Project '${sanitizedName}' created!`);
        logger.log(`  Settings: ${path.join(projectDir, 'index.json')}`);
        logger.log('');
        logger.log('Next steps:');
        logger.log(`  1. Edit prompt templates in: ${path.join(projectDir, 'config', 'actions')}/`);
        logger.log(`  2. Then run: blogpostgen -i generate`);
        logger.log('');
        process.exit(0);
      } catch (error) {
        outputError(error instanceof Error ? error.message : 'Failed to create project', 'PROJECT_INIT_ERROR');
        process.exit(1);
      }
    }
    finalPath = selectedProject;
  }

  // Non-interactive TTY generate mode - show article picker when:
  // 1. Action is 'generate'
  // 2. No --all flag
  // 3. Path is a project (not an article)
  // 4. stdin is TTY (interactive mode handled by loop above)
  if (
    finalAction === 'generate' &&
    !finalFlags.all &&
    finalPath &&
    process.stdin.isTTY
  ) {
    try {
      const resolved = resolvePath(finalPath);

      // Only show picker if path is a project (not an article)
      if (!resolved.isArticle && await projectExists(resolved)) {
        // Sync missing action prompts from server (auto-sync)
        try {
          const actionConfigResult = await executor.getActionConfig();
          if (actionConfigResult.success && actionConfigResult.config) {
            const projectPaths = getProjectPaths(resolved.projectName);
            const synced = await syncActionPrompts(projectPaths.root, actionConfigResult.config);
            if (synced.length > 0) {
              logger.log(`Synced ${synced.length} action file(s) from server`);
            }
          }
        } catch (err) {
          // Non-fatal: log and continue
          if (debug) {
            logger.log(`Action sync warning: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Get seed articles (no last_pipeline set)
        const articles = await getSeedArticles(resolved);

        if (articles.length > 0) {
          // Build selection list sorted by created_at (oldest first)
          const selectionList: ArticleForSelection[] = articles
            .map((a) => ({
              path: a.path,
              title: a.meta.title || a.path,
              created_at: a.meta.created_at || new Date().toISOString(),
              priority: a.meta.priority,
            }))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          let selectedPaths: string[];

          // Handle --range flag for batch processing
          if (finalFlags.range && typeof finalFlags.range === 'string') {
            const result = parseArticleSelection(finalFlags.range, selectionList.length, selectionList);
            if (result.warning) {
              logger.log(result.warning);
            }
            if (result.type === 'quit') {
              process.exit(0);
            } else if (result.type === 'all') {
              selectedPaths = selectionList.map(a => a.path);
            } else {
              selectedPaths = (result.indices || []).map(idx => selectionList[idx].path);
            }
            if (selectedPaths.length === 0) {
              logger.log(`No articles matched range: ${finalFlags.range}`);
              process.exit(1);
            }
          } else {
            // Show interactive picker
            selectedPaths = await selectArticlesForGeneration(selectionList);
          }

          if (selectedPaths.length === 0) {
            logger.log('No articles selected. Exiting.');
            process.exit(0);
          }

          // Process selected articles one by one
          logger.log(`Processing ${selectedPaths.length} article(s)...`);

          let totalTokens = 0;
          let totalCost = 0;
          const batchResults: Array<{
            path: string;
            title: string;
            success: boolean;
            error?: string;
            wordCount?: number;
          }> = [];

          for (let i = 0; i < selectedPaths.length; i++) {
            const articlePath = selectedPaths[i];
            const fullPath = `${resolved.projectName}/${articlePath}`;
            const articleInfo = selectionList.find(a => a.path === articlePath);

            logger.log(`[${i + 1}/${selectedPaths.length}] Generating: ${articlePath}`);

            const result = await executor.executeAction('generate', fullPath, finalFlags, { debug });

            if (result.success) {
              totalTokens += result.tokensUsed || 0;
              totalCost += result.costUsd || 0;
              // Extract word count from message (e.g., "Generated article: ... (740 words)")
              const wordMatch = result.message?.match(/\((\d+)\s*words\)/);
              const wordCount = wordMatch ? parseInt(wordMatch[1], 10) : undefined;
              batchResults.push({
                path: articlePath,
                title: articleInfo?.title || articlePath,
                success: true,
                wordCount,
              });
              logger.log(`  Done: ${result.message || 'Success'}`);
            } else {
              batchResults.push({
                path: articlePath,
                title: articleInfo?.title || articlePath,
                success: false,
                error: result.error,
              });
              logger.log(`  Error: ${result.error}`);
            }
          }

          // Enhanced summary display
          const projectPaths = getProjectPaths(resolved.projectName);
          displayBatchSummary(batchResults, totalTokens, totalCost, projectPaths.root);

          // Send iTerm2 notification
          const successCount = batchResults.filter(r => r.success).length;
          process.stdout.write(`\x1b]9;Generate: ${successCount}/${batchResults.length} articles ($${totalCost.toFixed(2)})\x07`);

          const hasErrors = batchResults.some(r => !r.success);
          process.exit(hasErrors ? 1 : 0);
        } else {
          logger.log('No seed articles ready for generation. Import a plan first.');
          process.exit(0);
        }
      }
    } catch (err) {
      // Path resolution failed - fall through to normal execution
      if (debug) {
        logger.log(`Interactive generate: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Non-interactive pipeline mode - when action is a known pipeline and path is provided
  // Uses API to get pipeline config and run all actions
  if (finalPath && process.stdin.isTTY) {
    const pipelineResult = await executor.getPipelineConfig(finalAction);
    if (pipelineResult.success && pipelineResult.config) {
      const config = pipelineResult.config;

      // If pipeline needs article selection, show picker
      if (config.articleFilter) {
        try {
          const resolved = resolvePath(finalPath);
          if (!resolved.isArticle && await projectExists(resolved)) {
            // Sync missing action prompts from server (auto-sync)
            try {
              const actionConfigResult = await executor.getActionConfig();
              if (actionConfigResult.success && actionConfigResult.config) {
                const projectPaths = getProjectPaths(resolved.projectName);
                const synced = await syncActionPrompts(projectPaths.root, actionConfigResult.config);
                if (synced.length > 0) {
                  logger.log(`Synced ${synced.length} action file(s) from server`);
                }
              }
            } catch (err) {
              // Non-fatal: log and continue
              if (debug) {
                logger.log(`Action sync warning: ${err instanceof Error ? err.message : String(err)}`);
              }
            }

            const filter = config.articleFilter;

            // Get articles matching the filter
            let eligibleArticles;
            if (filter.last_pipeline === null) {
              eligibleArticles = await getSeedArticles(resolved);
            } else {
              eligibleArticles = await getArticlesAfterPipeline(resolved, filter.last_pipeline);
            }

            if (eligibleArticles.length === 0) {
              logger.log(`No articles ready for ${finalAction}.`);
              process.exit(0);
            }

            // Build article selection list sorted by created_at (oldest first)
            const selectionList: ArticleForSelection[] = eligibleArticles
              .map((a) => ({
                path: a.path,
                title: a.meta.title || a.path,
                created_at: a.meta.created_at || new Date().toISOString(),
                priority: a.meta.priority,
              }))
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            let selectedPaths: string[];

            // Handle --range flag for batch processing
            if (finalFlags.range && typeof finalFlags.range === 'string') {
              const result = parseArticleSelection(finalFlags.range, selectionList.length, selectionList);
              if (result.warning) {
                logger.log(result.warning);
              }
              if (result.type === 'quit') {
                process.exit(0);
              } else if (result.type === 'all') {
                selectedPaths = selectionList.map(a => a.path);
              } else {
                selectedPaths = (result.indices || []).map(idx => selectionList[idx].path);
              }
              if (selectedPaths.length === 0) {
                logger.log(`No articles matched range: ${finalFlags.range}`);
                process.exit(1);
              }
            } else {
              // Show interactive picker
              selectedPaths = filter.last_pipeline === null
                ? await selectArticlesForGeneration(selectionList)
                : await selectArticlesForEnhancement(selectionList) || [];
            }

            if (selectedPaths.length === 0) {
              logger.log('No articles selected. Exiting.');
              process.exit(0);
            }

            // Run pipeline actions for each article
            // Filter out disabled actions (enabled: false)
            let actions = config.actions
              .filter(a => a.enabled !== false)
              .map(a => a.action);

            // Apply per-project exclusions
            const projectPathsForExclude = getProjectPaths(resolved.projectName);
            const excluded = loadExcludedActions(projectPathsForExclude.root, finalAction);
            actions = filterPipelineActions(actions, excluded, logger);

            logger.log(`\nRunning ${finalAction} pipeline (${actions.length} steps) on ${selectedPaths.length} article(s)`);

            let totalTokens = 0;
            let totalCost = 0;
            const batchResults: Array<{
              path: string;
              title: string;
              success: boolean;
              error?: string;
              wordCount?: number;
            }> = [];

            for (let i = 0; i < selectedPaths.length; i++) {
              const articlePath = selectedPaths[i];
              const fullPath = `${resolved.projectName}/${articlePath}`;
              const absoluteFilePath = path.join(getProjectPaths(resolved.projectName).content, articlePath, 'content.md');

              logger.log(`\n[${i + 1}/${selectedPaths.length}] Processing: ${articlePath}`);
              logger.log(`  File: ${absoluteFilePath}`);

              let articleSuccess = true;
              for (let m = 0; m < actions.length; m++) {
                const currentAction = actions[m];

                // Check if action was already applied — skip for all action types (local and API)
                const localFolderPath = path.join(getProjectPaths(resolved.projectName).content, articlePath);
                const actionMeta = await getArticleMeta(localFolderPath);
                if (actionMeta?.applied_actions?.includes(currentAction)) {
                  logger.log(`  [${m + 1}/${actions.length}] ${currentAction} skipped (already applied)`);
                  continue;
                }

                logger.log(`  [${m + 1}/${actions.length}] ${currentAction}...`);

                if (isLocalMode(currentAction)) {
                  if (currentAction === 'generate_image_social') {
                    const localResult = await generateImageSocialLocal(fullPath, logger);
                    if (localResult.success) {
                      logger.log(`  [${m + 1}/${actions.length}] ${currentAction} done (free)`);
                      if (localResult.count) await addAppliedAction(localFolderPath, currentAction);
                    } else {
                      logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${localResult.error}`);
                      articleSuccess = false;
                      break;
                    }
                  } else if (currentAction === 'verify_assets') {
                    const localResult = await verifyAssetsLocal(fullPath, logger);
                    if (localResult.success) {
                      logger.log(`  [${m + 1}/${actions.length}] ${currentAction} done (${localResult.count || 0} verified)`);
                      if (localResult.count) await addAppliedAction(localFolderPath, currentAction);
                    } else {
                      logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${localResult.error}`);
                      articleSuccess = false;
                      break;
                    }
                  } else if (currentAction === 'verify_links_and_sources') {
                    const localResult = await verifyLinksLocal(fullPath, logger);
                    if (localResult.success) {
                      logger.log(`  [${m + 1}/${actions.length}] ${currentAction} done (${localResult.count || 0} verified)`);
                      if (localResult.count) await addAppliedAction(localFolderPath, currentAction);
                    } else {
                      logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${localResult.error}`);
                      articleSuccess = false;
                      break;
                    }
                  }
                  continue;
                }

                const result = await executor.executeAction(finalAction === 'generate' ? 'generate' : 'enhance', fullPath, { mode: currentAction, pipelineName: finalAction }, { debug });

                if (result.success) {
                  totalTokens += result.tokensUsed || 0;
                  totalCost += result.costUsd || 0;
                  logger.log(`  [${m + 1}/${actions.length}] ${currentAction} DONE ($${(result.costUsd || 0).toFixed(4)}) → ${absoluteFilePath}`);

                  // Record the action in applied_actions
                  await addAppliedAction(localFolderPath, currentAction);
                } else {
                  logger.log(`  [${m + 1}/${actions.length}] ${currentAction} FAILED: ${result.error}`);
                  logger.log(`  File: ${absoluteFilePath}`);
                  articleSuccess = false;
                  break;
                }
              }

              // After all actions succeed, verify all pipeline actions are applied before updating last_pipeline
              if (articleSuccess) {
                const folderPath = path.join(getProjectPaths(resolved.projectName).content, articlePath);
                const articleMeta = await getArticleMeta(folderPath);
                const appliedActions = articleMeta?.applied_actions || [];
                const missingActions = actions.filter(action => !appliedActions.includes(action));

                if (missingActions.length > 0) {
                  logger.log(`  ⚠ Pipeline incomplete: missing actions [${missingActions.join(', ')}]`);
                  logger.log(`  → last_pipeline NOT updated (still: ${articleMeta?.last_pipeline || 'null'})`);
                  articleSuccess = false;
                } else {
                  // All actions applied - safe to update last_pipeline
                  await updateArticleMeta(folderPath, { last_pipeline: finalAction });
                }
              }

              batchResults.push({
                path: articlePath,
                title: articlePath,
                success: articleSuccess,
                error: articleSuccess ? undefined : 'Pipeline failed',
              });
            }

            const projectPaths = getProjectPaths(resolved.projectName);
            displayBatchSummary(batchResults, totalTokens, totalCost, projectPaths.root);

            // Send iTerm2 notification
            const successCount = batchResults.filter(r => r.success).length;
            process.stdout.write(`\x1b]9;${finalAction}: ${successCount}/${batchResults.length} articles ($${totalCost.toFixed(2)})\x07`);

            const hasErrors = batchResults.some(r => !r.success);
            process.exit(hasErrors ? 1 : 0);
          }
        } catch (err) {
          if (debug) {
            logger.log(`Non-interactive pipeline: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
  }

  // Handle local-only modes (e.g., generate_image_social, verify_assets) before API call
  // Check both finalFlags.action and finalFlags.mode (CLI uses --mode for enhance)
  const localMode = finalFlags.action || finalFlags.mode;
  if (finalAction === 'enhance' && localMode && isLocalMode(localMode)) {
    // Resolve path to get folder path for applied_actions update
    const resolvedLocal = finalPath ? resolvePath(finalPath) : null;
    const localFolderPath = resolvedLocal?.projectName && resolvedLocal?.articlePath
      ? path.join(getProjectPaths(resolvedLocal.projectName).content, resolvedLocal.articlePath)
      : null;

    if (localMode === 'generate_image_social' && finalPath) {
      logger.log(`Executing local mode: ${localMode}`);
      const localResult = await generateImageSocialLocal(finalPath, logger);
      if (localResult.success) {
        logger.log(`Done: social image generated (free)`);
        if (localResult.count && localFolderPath) await addAppliedAction(localFolderPath, localMode);
        process.exit(0);
      } else {
        outputError(localResult.error || 'Local action failed', 'LOCAL_ACTION_ERROR');
        process.exit(1);
      }
    } else if (localMode === 'verify_assets' && finalPath) {
      logger.log(`Executing local mode: ${localMode}`);
      const localResult = await verifyAssetsLocal(finalPath, logger);
      if (localResult.success) {
        logger.log(`Done: ${localResult.count || 0} asset(s) verified`);
        if (localResult.count && localFolderPath) await addAppliedAction(localFolderPath, localMode);
        process.exit(0);
      } else {
        outputError(localResult.error || 'Local action failed', 'LOCAL_ACTION_ERROR');
        process.exit(1);
      }
    } else if (localMode === 'verify_links_and_sources' && finalPath) {
      logger.log(`Executing local mode: ${localMode}`);
      const localResult = await verifyLinksLocal(finalPath, logger);
      if (localResult.success) {
        logger.log(`Done: ${localResult.count || 0} link(s) verified`);
        if (localResult.count && localFolderPath) await addAppliedAction(localFolderPath, localMode);
        process.exit(0);
      } else {
        outputError(localResult.error || 'Local action failed', 'LOCAL_ACTION_ERROR');
        process.exit(1);
      }
    }
  }

  // Handle publish action (unified: auto-detect method from config)
  if (finalAction === 'publish') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen publish <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;
    const projectPaths = getProjectPaths(selectedProject);

    if (!existsSync(projectPaths.root)) {
      outputError(`Error: Project not found: ${selectedProject}`);
      process.exit(1);
    }

    const { loadProjectConfig } = await import('./lib/project-config.js');
    const projectConfig = await loadProjectConfig(projectPaths.root);

    if (!projectConfig?.publish_to_local_folder?.enabled) {
      outputError('Local folder publishing is not configured for this project.');
      outputError('Edit the project\'s index.json and set publish_to_local_folder.enabled to true.');
      process.exit(1);
    }

    const { publishToLocalFolder, getPublishMethod } = await import('./lib/local-publish.js');
    const method = getPublishMethod(projectConfig.publish_to_local_folder);

    logger.log(`Publishing ${selectedProject} [${method}] → ${projectConfig.publish_to_local_folder.path}...`);

    try {
      const localResult = await publishToLocalFolder(
        projectPaths.root,
        projectConfig.publish_to_local_folder,
        logger,
        projectConfig,
      );

      logger.log(`${localResult.articlesPublished} article(s) published`);
      logger.log(`Assets: ${localResult.assetsCopied} copied`);
      if (localResult.errors.length > 0) {
        logger.log(`Errors: ${localResult.errors.length}`);
        for (const err of localResult.errors) {
          logger.log(`  ✗ ${err.file}: ${err.error}`);
        }
        process.exit(1);
      }
      process.exit(0);
    } catch (error) {
      outputError(`Publish failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      outputError(`  Project folder: ${projectPaths.root}`);
      outputError(`  Config file:    ${projectPaths.root}/index.json`);
      outputError(`  Settings:       ${JSON.stringify(projectConfig.publish_to_local_folder, null, 2)}`);
      process.exit(1);
    }
  }

  // Handle wb-preview action (local - no API needed)
  if (finalAction === 'wb-preview') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen wb-preview <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;
    const projectPaths = getProjectPaths(selectedProject);

    // Check project exists
    if (!existsSync(projectPaths.root)) {
      outputError(`Error: Project not found: ${selectedProject}`);
      process.exit(1);
    }

    const { runWebsitePreview } = await import('./lib/wb-preview.js');
    const { loadProjectConfig } = await import('./lib/project-config.js');
    const projectConfig = await loadProjectConfig(projectPaths.root);

    logger.log(`Building website preview for project: ${selectedProject}`);

    const previewResult = await runWebsitePreview({
      projectRoot: projectPaths.root,
      projectName: selectedProject,
      projectConfig: projectConfig || undefined,
      logger,
    });

    if (previewResult.success) {
      logger.log(chalk.green('\n✓ Website built successfully!'));
      logger.log(chalk.white(`  Output: ${previewResult.path}`));
      logger.log(chalk.cyan('\nTo preview, run:'));
      logger.log(chalk.white(`  npx serve ${previewResult.path}`));
      process.exit(0);
    } else {
      outputError(`Build failed: ${previewResult.error}`);
      process.exit(1);
    }
  }

  // Handle wb-build action (local - no API needed)
  if (finalAction === 'wb-build') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen wb-build <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;
    const projectPaths = getProjectPaths(selectedProject);

    // Check project exists
    if (!existsSync(projectPaths.root)) {
      outputError(`Error: Project not found: ${selectedProject}`);
      process.exit(1);
    }

    const { buildWebsiteLocal } = await import('./lib/wb-build.js');
    const { loadProjectConfig } = await import('./lib/project-config.js');
    const projectConfig = await loadProjectConfig(projectPaths.root);

    logger.log(`Building website locally for project: ${selectedProject}`);

    const buildResult = await buildWebsiteLocal({
      projectRoot: projectPaths.root,
      projectName: selectedProject,
      projectConfig: projectConfig || undefined,
      logger,
    });

    if (buildResult.success) {
      logger.log(chalk.green('\n✓ Website built successfully!'));
      logger.log(chalk.white(`  Output: ${buildResult.path}`));
      if (buildResult.articlesCount !== undefined) {
        logger.log(chalk.white(`  Articles: ${buildResult.articlesCount}`));
      }
      if (buildResult.pagesCount !== undefined) {
        logger.log(chalk.white(`  Pages: ${buildResult.pagesCount}`));
      }
      logger.log(chalk.cyan('\nTo preview, run:'));
      logger.log(chalk.white(`  npx serve ${buildResult.path}`));
      process.exit(0);
    } else {
      outputError(`Build failed: ${buildResult.error}`);
      process.exit(1);
    }
  }

  // Handle migrate action (local - no API needed)
  if (finalAction === 'migrate') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen migrate <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;

    logger.log(`Checking migration status for: ${selectedProject}`);

    // Check if migration is needed
    const checkResult = await checkMigrationNeeded(selectedProject);

    if (!checkResult.projectConfig && checkResult.articleCount === 0) {
      logger.log(chalk.green('✓ Project is already using the unified format (index.json).'));
      logger.log('  No migration needed.');
      process.exit(0);
    }

    logger.log('Migration needed:');
    if (checkResult.projectConfig) {
      logger.log(`  • Project config: _project.json → index.json`);
    }
    if (checkResult.articleCount > 0) {
      logger.log(`  • Articles: ${checkResult.articleCount} folder(s) with meta.json`);
    }
    logger.log('');

    // Run migration
    const migrateResult = await migrateToUnifiedFormat(selectedProject);

    logger.log('');
    logger.log(chalk.green('Migration complete!'));
    logger.log(`  Project config: ${migrateResult.project.migrated ? 'migrated' : 'skipped'}`);
    logger.log(`  Articles migrated: ${migrateResult.articles.migrated}`);
    logger.log(`  Articles skipped: ${migrateResult.articles.skipped}`);
    if (migrateResult.articles.errors.length > 0) {
      logger.log(chalk.red(`  Errors: ${migrateResult.articles.errors.length}`));
      for (const err of migrateResult.articles.errors) {
        logger.log(`    - ${err.path}: ${err.error}`);
      }
      process.exit(1);
    }

    process.exit(0);
  }

  // Handle migrate-faq action (local - no API needed)
  if (finalAction === 'migrate-faq') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen migrate-faq <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;

    logger.log(`Extracting FAQ from content for: ${selectedProject}`);

    const result = await migrateFaqFromContentProject(selectedProject);

    logger.log('');
    logger.log(chalk.green('Migration complete!'));
    logger.log(`  FAQ extracted: ${result.faqMigrated}`);
    logger.log(`  Skipped (no FAQ): ${result.skipped}`);
    if (result.errors.length > 0) {
      logger.log(chalk.red(`  Errors: ${result.errors.length}`));
      for (const err of result.errors) {
        logger.log(`    - ${err.path}: ${err.error}`);
      }
      process.exit(1);
    }

    process.exit(0);
  }

  // Handle migrate-jsonld action (local - no API needed)
  if (finalAction === 'migrate-jsonld') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen migrate-jsonld <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;

    logger.log(`Extracting JSON-LD from content for: ${selectedProject}`);

    const result = await migrateJsonldFromContentProject(selectedProject);

    logger.log('');
    logger.log(chalk.green('Migration complete!'));
    logger.log(`  JSON-LD extracted: ${result.jsonldMigrated}`);
    logger.log(`  Skipped (no JSON-LD): ${result.skipped}`);
    if (result.errors.length > 0) {
      logger.log(chalk.red(`  Errors: ${result.errors.length}`));
      for (const err of result.errors) {
        logger.log(`    - ${err.path}: ${err.error}`);
      }
      process.exit(1);
    }

    process.exit(0);
  }

  // Handle migrate-content action (local - no API needed)
  if (finalAction === 'migrate-content') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen migrate-content <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;

    logger.log(`Extracting FAQ and JSON-LD from content for: ${selectedProject}`);

    const result = await migrateContentExtractAllProject(selectedProject);

    logger.log('');
    logger.log(chalk.green('Migration complete!'));
    logger.log(`  Total articles: ${result.total}`);
    logger.log(`  FAQ extracted: ${result.faqMigrated}`);
    logger.log(`  JSON-LD extracted: ${result.jsonldMigrated}`);
    logger.log(`  Skipped (no FAQ/JSON-LD): ${result.skipped}`);
    if (result.errors.length > 0) {
      logger.log(chalk.red(`  Errors: ${result.errors.length}`));
      for (const err of result.errors) {
        logger.log(`    - ${err.path}: ${err.error}`);
      }
      process.exit(1);
    }

    process.exit(0);
  }

  // Handle migrate-published-at action (local - no API needed)
  if (finalAction === 'migrate-published-at') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen migrate-published-at <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;

    logger.log(`Backfilling published_at from updated_at for: ${selectedProject}`);

    const result = await migrateBackfillPublishedAt(selectedProject);

    logger.log('');
    logger.log(chalk.green('Migration complete!'));
    logger.log(`  Total articles: ${result.total}`);
    logger.log(`  Backfilled: ${result.migrated}`);
    logger.log(`  Skipped (already set): ${result.skipped}`);
    if (result.errors.length > 0) {
      logger.log(chalk.red(`  Errors: ${result.errors.length}`));
      for (const err of result.errors) {
        logger.log(`    - ${err.path}: ${err.error}`);
      }
      process.exit(1);
    }

    process.exit(0);
  }

  // Handle pipeline-verify action (local - no API needed)
  if (finalAction === 'pipeline-verify') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen pipeline-verify <project> [--fix]');
      process.exit(1);
    }

    const selectedProject = finalPath;

    logger.log(`\nVerifying pipeline state for: ${selectedProject}\n`);

    try {
      const result = await verifyProject(selectedProject);

      logger.log(`Total articles: ${result.totalArticles}  |  Valid: ${result.validArticles}  |  Invalid: ${result.invalidArticles}`);

      if (result.invalidArticles === 0) {
        logger.log(chalk.green('\n✓ All articles have complete pipeline actions.'));
        process.exit(0);
      }

      logger.log('\nArticles with incomplete pipeline actions:\n');

      for (const r of result.results) {
        logger.log(`  ${r.articlePath}`);
        logger.log(`    File: ${path.join(r.absolutePath, 'index.json')}`);
        logger.log(`    Pipeline: ${r.lastPipeline} (expected ${r.expectedActions.length} actions, applied ${r.appliedActions.length})`);
        logger.log(`    Missing: ${r.missingActions.join(', ')}`);
        logger.log('');
      }

      if (flags.fix) {
        const fixedCount = await fixArticles(result.results, selectedProject);
        logger.log(chalk.green(`\nFixed ${fixedCount} article(s). They can now be re-processed by the enhance pipeline.`));
      } else {
        const shouldFix = await confirm(`Fix ${result.invalidArticles} article(s) by reverting last_pipeline to previous state?`, false);
        if (shouldFix) {
          const fixedCount = await fixArticles(result.results, selectedProject);
          logger.log(chalk.green(`\nFixed ${fixedCount} article(s). They can now be re-processed by the enhance pipeline.`));
        } else {
          logger.log('\nFix skipped.');
        }
      }
    } catch (error: any) {
      logger.log(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }

    process.exit(0);
  }

  // Handle assets-cleanup action (local - no API needed)
  if (finalAction === 'assets-cleanup') {
    if (!finalPath) {
      outputError('Error: Project name required. Usage: blogpostgen assets-cleanup <project>');
      process.exit(1);
    }

    const selectedProject = finalPath;

    logger.log(`\nScanning assets for: ${selectedProject}\n`);

    try {
      const result = await findOrphanedAssets(selectedProject);

      logger.log(`Articles: ${result.totalArticles} total, ${result.articlesScanned} with assets`);
      logger.log(`Orphaned: ${result.orphanedAssets.length} file(s) in ${result.articlesWithOrphans} article(s) (${formatBytes(result.totalOrphanedBytes)})\n`);

      if (result.orphanedAssets.length === 0) {
        logger.log(chalk.green('✓ No orphaned assets found.'));
      } else {
        // Group by assetsDir for display
        const byAssetsDir = new Map<string, typeof result.orphanedAssets>();
        for (const asset of result.orphanedAssets) {
          const list = byAssetsDir.get(asset.assetsDir) || [];
          list.push(asset);
          byAssetsDir.set(asset.assetsDir, list);
        }

        for (const [assetsDir, assets] of byAssetsDir) {
          logger.log(`  ${assetsDir}/`);
          for (const asset of assets) {
            logger.log(`    ${asset.fileName}  (${formatBytes(asset.size)})`);
          }
          logger.log('');
        }

        const shouldRemove = await confirm(
          `Remove ${result.orphanedAssets.length} orphaned file(s)?`,
          false
        );

        if (shouldRemove) {
          const removed = await removeAssets(result.orphanedAssets);
          logger.log(chalk.green(`\nRemoved ${removed} file(s).`));
        } else {
          logger.log('\nRemoval skipped.');
        }
      }

      // Phase 2: Legacy "index" field cleanup
      const legacyArticles = await findLegacyIndexFields(selectedProject);
      if (legacyArticles.length > 0) {
        const removeCount = legacyArticles.filter(a => a.action === 'remove_index').length;
        const renameCount = legacyArticles.filter(a => a.action === 'rename_index_to_content').length;

        logger.log(`\nLegacy "index" field found in ${legacyArticles.length} article(s):`);
        if (removeCount) logger.log(`  ${removeCount} with both index+content (will remove index)`);
        if (renameCount) logger.log(`  ${renameCount} with index only (will rename to content)`);

        for (const article of legacyArticles) {
          logger.log(`  ${article.articlePath} → ${article.action === 'remove_index' ? 'remove index' : 'rename index→content'}`);
        }

        const shouldFix = await confirm(`Fix ${legacyArticles.length} article(s)?`, false);
        if (shouldFix) {
          const fixed = await fixLegacyIndexFields(legacyArticles);
          logger.log(chalk.green(`Fixed ${fixed} article(s).`));
        }
      }
    } catch (error: any) {
      logger.log(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }

    process.exit(0);
  }

  // Execute action via API
  const result = await executor.executeAction(finalAction, finalPath, finalFlags, { debug });

  if (!result.success) {
    outputError(result.error || 'Action failed', 'ACTION_ERROR');
    process.exit(1);
  }

  // Output result
  if (result.message) {
    logger.log(result.message);
  }

  if (result.tokensUsed || result.costUsd) {
    logger.log(`Tokens: ${result.tokensUsed || 0}, Cost: $${(result.costUsd || 0).toFixed(4)}`);
  }

  // Output JSON for piping
  if (result.data) {
    output({
      success: true,
      ...result.data,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
    });
  }

  process.exit(0);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
