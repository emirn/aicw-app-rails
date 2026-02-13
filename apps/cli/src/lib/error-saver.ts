/**
 * Error Saver
 *
 * Saves import errors (parse warnings and execution errors) to markdown files
 * in {project}/errors/ for later review.
 */

import { promises as fs } from 'fs';
import path from 'path';

export async function saveImportErrors(
  projectDir: string,
  actionName: string,
  errors: {
    parseWarnings?: Array<{ blockIndex: number; reason: string; rawBlock: string }>;
    executionErrors?: Array<{ path: string; error: string }>;
  }
): Promise<string | null> {
  const hasParseWarnings = errors.parseWarnings && errors.parseWarnings.length > 0;
  const hasExecutionErrors = errors.executionErrors && errors.executionErrors.length > 0;

  if (!hasParseWarnings && !hasExecutionErrors) {
    return null;
  }

  const errorsDir = path.join(projectDir, 'errors');
  await fs.mkdir(errorsDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString().replace(/[T:]/g, '-').replace(/\..+/, '').replace(/-/g, (m, i) => i > 9 ? '' : m);
  // Format: YYYY-MM-DD-HHmmss
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const filename = `${actionName}-errors-${ts}.md`;
  const filePath = path.join(errorsDir, filename);

  const lines: string[] = [];
  lines.push(`# ${actionName} errors — ${now.toISOString()}`);
  lines.push('');

  if (hasParseWarnings) {
    lines.push(`## Parse Errors (${errors.parseWarnings!.length})`);
    lines.push('');
    for (const w of errors.parseWarnings!) {
      lines.push(`### Block ${w.blockIndex}: ${w.reason}`);
      lines.push('');
      lines.push('```');
      lines.push(w.rawBlock.trim());
      lines.push('```');
      lines.push('');
    }
  }

  if (hasExecutionErrors) {
    lines.push(`## Execution Errors (${errors.executionErrors!.length})`);
    lines.push('');
    for (const e of errors.executionErrors!) {
      lines.push(`- **${e.path}**: ${e.error}`);
    }
    lines.push('');
  }

  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}
