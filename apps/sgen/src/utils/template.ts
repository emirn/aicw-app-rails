import { readFileSync, existsSync } from 'fs';
import { join, dirname, extname, isAbsolute, resolve } from 'path';

// Security: Only allow file includes from these directories
const ALLOWED_INCLUDE_ROOTS = [
  resolve(join(__dirname, '..', '..', 'config')),
];

/**
 * Validate that a file path is within allowed directories
 * Throws error if path traversal is attempted (security protection)
 */
const validateIncludePath = (filePath: string): void => {
  const resolved = resolve(filePath);
  const isAllowed = ALLOWED_INCLUDE_ROOTS.some(root => resolved.startsWith(root + '/') || resolved === root);
  if (!isAllowed) {
    throw new Error(`SECURITY: Path traversal blocked. File '${filePath}' is outside allowed directories.`);
  }
};

export const renderTemplate = (
  template: string,
  data: Record<string, unknown>,
  opts?: { includePaths?: string[] }
): string => {
  // Resolve include search paths; prefer provided, then default shared prompts dir
  const defaultInclude = join(__dirname, '..', '..', 'config', 'prompts');
  const includeRoots = Array.from(new Set([...(opts?.includePaths || []), defaultInclude]));

  // Phase 1: Process file includes (macros)
  let result = template.replace(/{{\s*file:([^}]+)\s*}}/g, (match, incPathRaw) => {
    const incRef = String(incPathRaw || '').trim();
    try {
      // If absolute path, validate and read; otherwise search include roots
      const hasExt = extname(incRef) && extname(incRef).length > 0;
      const refWithExt = hasExt ? incRef : `${incRef}.md`;
      if (isAbsolute(refWithExt)) {
        validateIncludePath(refWithExt);
        return readFileSync(refWithExt, 'utf8');
      }
      for (const root of includeRoots) {
        const candidate = join(root, refWithExt);
        if (existsSync(candidate)) {
          validateIncludePath(candidate);
          return readFileSync(candidate, 'utf8');
        }
      }
      throw new Error(`include not found in search paths`);
    } catch (err: any) {
      throw new Error(`Failed to include file '${incRef}': ${err.message}`);
    }
  });
  
  // Phase 2: Process data variables with strict non-empty validation
  result = result.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => {
    const value = data[key];
    if (value === undefined || value === null) {
      throw new Error(`Missing template value for '${key}'`);
    }
    const strValue = String(value);
    // Universal check: all replacements must be non-empty (no whitespace-only)
    if (strValue.trim() === '') {
      throw new Error(
        `Empty macro replacement for {{${key}}}.\n` +
        `Please ensure this variable has content.`
      );
    }
    return strValue;
  });

  // Validate no unprocessed template macros remain
  // Use regex to find actual macro patterns {{word}} not just {{ or }}
  // This allows legitimate uses like Mermaid's %%{init:...}}}%%
  const unreplacedMacro = result.match(/\{\{\s*\w+\s*\}\}/);
  if (unreplacedMacro) {
    throw new Error(`Unreplaced template macro: ${unreplacedMacro[0]}`);
  }

  return result;
};

export const renderTemplateFile = (
  relativePath: string,
  data: Record<string, unknown>
): string => {
  const templatePath = join(__dirname, '..', '..', 'config', 'prompts', relativePath);

  if (!existsSync(templatePath)) {
    throw new Error(
      `Template file not found: ${relativePath}\n` +
      `Expected at: ${templatePath}\n` +
      `Check that the file exists in config/prompts/`
    );
  }

  const template = readFileSync(templatePath, 'utf8');
  return renderTemplate(template, data, { includePaths: [dirname(templatePath)] });
};

export const renderTemplateAbsolutePath = (
  absolutePath: string,
  data: Record<string, unknown>
): string => {
  const template = readFileSync(absolutePath, 'utf8');
  return renderTemplate(template, data, { includePaths: [dirname(absolutePath)] });
};
