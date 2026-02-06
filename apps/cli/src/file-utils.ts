import { promises as fs } from 'fs';
import path from 'path';

/**
 * Save data to a file as JSON
 */
export async function save(filePath: string, data: any): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Load data from a JSON file
 */
export async function load<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Check if a file exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save debug information when DEBUG_MODE=true
 * Following DRY principle - single helper used across all debug saves
 */
export async function saveDebugFiles(
  projectPath: string,
  filePrefix: string,
  debugInfo?: { prompt_text: string; raw_response: string }
): Promise<void> {
  if (process.env.DEBUG_MODE !== 'true' || !debugInfo) {
    return;
  }

  const debugDir = path.join(projectPath, 'DEBUG');
  await fs.mkdir(debugDir, { recursive: true });

  // Save prompt
  await fs.writeFile(
    path.join(debugDir, `${filePrefix}.prompt.txt`),
    debugInfo.prompt_text,
    'utf-8'
  );

  // Save raw response
  await fs.writeFile(
    path.join(debugDir, `${filePrefix}.raw-response.txt`),
    debugInfo.raw_response,
    'utf-8'
  );
}
