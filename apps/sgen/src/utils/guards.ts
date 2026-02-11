import { existsSync, readFileSync } from 'fs';
import { join, isAbsolute } from 'path';
import { config } from '../config/server-config';
import { IBrandingColors } from '@blogpostgen/types';

export const getPromptMaxChars = () => config.prompts.maxChars;

export function ensurePromptOK(prompt: string) {
  const max = getPromptMaxChars();
  if (typeof prompt !== 'string') throw new Error('Prompt must be a string');
  if (prompt.length > max) throw new Error(`Prompt exceeds max length of ${max} chars`);
}

export function ensureTemplateExistsNonEmpty(pathOrRelative: string) {
  const base = join(__dirname, '..', '..', 'config', 'prompts');
  const full = isAbsolute(pathOrRelative) ? pathOrRelative : join(base, pathOrRelative);
  if (!existsSync(full)) throw new Error(`Template not found: ${pathOrRelative}`);
  const content = readFileSync(full, 'utf8');
  if (!content || content.trim().length === 0) throw new Error(`Template is empty: ${pathOrRelative}`);
}

export function ensureNonEmptyText(label: string, text: string) {
  if (!text || text.trim().length === 0) throw new Error(`${label} is empty`);
}

/**
 * Require branding colors for visual actions (image hero, social image, diagrams).
 * Returns the validated colors object so callers can use it directly.
 */
export function requireBrandingColors(
  colors: IBrandingColors | undefined,
  action: string
): IBrandingColors {
  if (!colors || !colors.primary) {
    throw new Error(
      `Branding colors required for "${action}" but not set. ` +
      `Set branding.colors (at least "primary") in project config.`
    );
  }
  return colors;
}

/**
 * Validate that no unreplaced macros remain in the prompt.
 * Throws if {{...}} patterns are found (indicates missing variable substitution).
 */
export function ensureNoUnreplacedMacros(prompt: string, context?: string) {
  const macroPattern = /\{\{[^}]+\}\}/g;
  const matches = prompt.match(macroPattern);
  if (matches && matches.length > 0) {
    const uniqueMacros = [...new Set(matches)];
    const location = context ? ` in ${context}` : '';
    throw new Error(
      `Unreplaced macros found${location}: ${uniqueMacros.join(', ')}. ` +
      `Ensure all template variables are defined.`
    );
  }
}
