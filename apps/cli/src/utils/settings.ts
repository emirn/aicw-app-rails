import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { getSettingsPath } from '../config/user-paths';

/**
 * User settings persisted across CLI sessions
 */
export interface UserSettings {
  lastUsedProject?: string;
}

const DEFAULT_SETTINGS: UserSettings = {};

/**
 * Load user settings from disk
 */
export async function loadSettings(): Promise<UserSettings> {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const content = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as UserSettings;
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch {
    // If file is corrupted or invalid, return defaults
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save user settings to disk
 */
export async function saveSettings(settings: UserSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Set the last used project name
 */
export async function setLastUsedProject(projectName: string): Promise<void> {
  const settings = await loadSettings();
  settings.lastUsedProject = projectName;
  await saveSettings(settings);
}

/**
 * Get the last used project name
 */
export async function getLastUsedProject(): Promise<string | undefined> {
  const settings = await loadSettings();
  return settings.lastUsedProject;
}
