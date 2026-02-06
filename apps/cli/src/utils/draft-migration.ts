import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { getProjectPaths, initializeProjectDirectories } from '../config/user-paths';
import { ContentPlan } from '../types';
import { createDraftFromPlanItem, hasDrafts } from './draft-utils';

/**
 * Check if a project has a legacy JSON plan that needs migration
 */
export async function needsMigration(projectName: string): Promise<boolean> {
  const paths = getProjectPaths(projectName);
  const legacyPlanPath = path.join(paths.root, 'step-1-plan.json');

  // Has legacy plan but no drafts yet
  const hasLegacyPlan = existsSync(legacyPlanPath);
  const hasDraftFiles = await hasDrafts(projectName);

  return hasLegacyPlan && !hasDraftFiles;
}

/**
 * Load a legacy JSON content plan
 */
async function loadLegacyPlan(projectPath: string): Promise<ContentPlan | null> {
  const planPath = path.join(projectPath, 'step-1-plan.json');

  if (!existsSync(planPath)) {
    return null;
  }

  try {
    const content = await fs.readFile(planPath, 'utf-8');
    return JSON.parse(content) as ContentPlan;
  } catch (error) {
    console.error('Failed to load legacy plan:', error);
    return null;
  }
}

/**
 * Migrate a legacy JSON plan to individual draft markdown files
 * Returns the number of drafts created
 */
export async function migrateLegacyPlan(projectName: string): Promise<number> {
  const paths = getProjectPaths(projectName);

  // Ensure directories exist
  await initializeProjectDirectories(projectName);

  // Load legacy plan
  const plan = await loadLegacyPlan(paths.root);
  if (!plan || !plan.items || plan.items.length === 0) {
    return 0;
  }

  console.log(`Migrating ${plan.items.length} plan items to draft files...`);

  // Create draft files from plan items
  let created = 0;
  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    try {
      await createDraftFromPlanItem(projectName, item, i);
      created++;
    } catch (error) {
      console.error(`Failed to create draft for ${item.slug}:`, error);
    }
  }

  // Backup the original JSON plan
  const legacyPlanPath = path.join(paths.root, 'step-1-plan.json');
  const backupPath = path.join(paths.root, 'step-1-plan.json.bak');

  try {
    await fs.rename(legacyPlanPath, backupPath);
    console.log(`Original plan backed up to: step-1-plan.json.bak`);
  } catch (error) {
    console.error('Failed to backup legacy plan:', error);
  }

  console.log(`Migration complete: ${created} draft files created in drafts/`);
  return created;
}

/**
 * Check and migrate if needed, returns true if migration was performed
 */
export async function checkAndMigrate(projectName: string): Promise<boolean> {
  if (await needsMigration(projectName)) {
    const count = await migrateLegacyPlan(projectName);
    return count > 0;
  }
  return false;
}
