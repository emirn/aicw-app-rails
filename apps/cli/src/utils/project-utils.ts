import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { getProjectPaths, initializeProjectDirectories } from '../config/user-paths';
import { Project } from '../types';
import { normalizeUrl } from '../url-utils';

// Re-export getProjectPaths for easy access
export { getProjectPaths } from '../config/user-paths';

/**
 * Project management utilities
 * Handles project creation, metadata, and organization
 */

/**
 * Sanitize project name for filesystem use
 * Removes special characters and ensures valid filename
 */
export function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, '-')  // Replace invalid chars with dash
    .replace(/-+/g, '-')             // Replace multiple dashes with single
    .replace(/^-|-$/g, '')           // Remove leading/trailing dashes
    .substring(0, 100);              // Limit length
}

/**
 * Generate project name from URL
 * Extracts domain and converts to filesystem-safe name
 */
export function projectNameFromUrl(url: string | undefined): string {
  if (!url) {
    return 'default-project';
  }

  try {
    // Normalize URL first to ensure it has a protocol
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    return sanitizeProjectName(hostname);
  } catch (error) {
    // Fallback if URL is invalid
    return sanitizeProjectName(url);
  }
}

/**
 * Check if project exists
 */
export async function projectExists(projectName: string): Promise<boolean> {
  const paths = getProjectPaths(projectName);
  return existsSync(paths.projectJson);
}

/**
 * Load project metadata
 */
export async function loadProject(projectName: string): Promise<Project | null> {
  const paths = getProjectPaths(projectName);

  if (!existsSync(paths.projectJson)) {
    return null;
  }

  try {
    const content = await fs.readFile(paths.projectJson, 'utf8');
    const project = JSON.parse(content) as Project;
    // Ensure name matches the directory name (source of truth)
    project.name = projectName;
    return project;
  } catch (error) {
    console.error(`Failed to load project ${projectName}:`, error);
    return null;
  }
}

/**
 * Save project metadata
 */
export async function saveProject(project: Project): Promise<void> {
  const paths = getProjectPaths(project.name);

  // Ensure project directories exist
  await initializeProjectDirectories(project.name);

  // Save project.json
  await fs.writeFile(
    paths.projectJson,
    JSON.stringify(project, null, 2),
    'utf8'
  );
}

/**
 * Create or update project
 * Initializes directory structure and saves metadata
 */
export async function createOrUpdateProject(
  projectName: string,
  url: string,
  websiteInfo?: any
): Promise<Project> {
  // Normalize URL to ensure it has https:// protocol
  const normalizedUrl = normalizeUrl(url);

  // Load existing project or create new
  let project = await loadProject(projectName);

  if (project) {
    // Update existing project
    project.url = normalizedUrl;
    project.updated_at = new Date().toISOString();
    if (websiteInfo) {
      // Ensure website_info.url is also normalized
      websiteInfo.url = normalizedUrl;
      project.website_info = websiteInfo;
    }
  } else {
    // Create new project
    project = {
      name: projectName,
      url: normalizedUrl,
      website_info: websiteInfo ? { ...websiteInfo, url: normalizedUrl } : websiteInfo,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      article_count: 0
    };
  }

  // Save project metadata
  await saveProject(project);

  return project;
}

/**
 * Increment article count for project
 */
export async function incrementArticleCount(projectName: string): Promise<void> {
  const project = await loadProject(projectName);

  if (project) {
    project.article_count = (project.article_count || 0) + 1;
    project.updated_at = new Date().toISOString();
    await saveProject(project);
  }
}

/**
 * List all projects
 */
export async function listProjects(): Promise<Project[]> {
  const { USER_PROJECTS_DIR } = await import('../config/user-paths');

  if (!existsSync(USER_PROJECTS_DIR)) {
    return [];
  }

  const entries = await fs.readdir(USER_PROJECTS_DIR, { withFileTypes: true });
  const projects: Project[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const project = await loadProject(entry.name);
      if (project) {
        projects.push(project);
      }
    }
  }

  // Sort by updated_at descending (most recent first)
  return projects.sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}
