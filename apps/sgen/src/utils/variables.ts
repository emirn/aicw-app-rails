/**
 * Variable Replacement Utility
 *
 * Handles {{variable_name}} macro replacement in prompt templates.
 * Used for brand colors, custom settings, and other configurable values.
 */

/**
 * Replace all {{variable_name}} macros in a template with their values
 *
 * @param template - Template string with {{variable_name}} macros
 * @param variables - Key-value pairs to substitute
 * @returns Template with variables replaced
 */
export function replaceVariables(template: string, variables?: Record<string, string>): string {
  if (!variables || Object.keys(variables).length === 0) {
    return template;
  }

  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    // Case-insensitive replacement for {{key}}
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Get nested value from object using dot-notation path
 *
 * @param obj - Object to traverse
 * @param path - Dot-notation path (e.g., "branding.colors.primary")
 * @returns Value at path or undefined if not found
 */
function getNestedValue(obj: unknown, path: string): string | undefined {
  const result = path.split('.').reduce((o: unknown, k: string) => {
    if (o && typeof o === 'object' && k in o) {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);

  return typeof result === 'string' ? result : undefined;
}

/**
 * Resolve {{project.path.to.field}} macros in variables using project config
 *
 * @param variables - Key-value object with potential {{project.*}} macros
 * @param projectConfig - Project configuration object to resolve paths from
 * @returns Resolved variables with project values substituted
 * @throws Error if macros can't be resolved (missing projectConfig or path not found)
 *
 * @example
 * const colors = {
 *   primary_color: "{{project.branding.colors.primary}}",
 *   secondary_color: "{{project.branding.colors.secondary}}"
 * };
 * const resolved = resolveProjectMacros(colors, projectConfig);
 * // { primary_color: "#1E40AF", secondary_color: "#3B82F6" }
 */
/**
 * Resolve {{project.path.to.value}} macros directly in a text string
 *
 * Unlike resolveProjectMacros (which handles key-value objects), this function
 * replaces {{project.*}} macros inline within text content. Used for templates
 * that directly embed project config paths like {{project.branding.colors.primary}}.
 *
 * @param text - Text containing {{project.*}} macros
 * @param projectConfig - Project config to resolve paths from
 * @returns Text with all {{project.*}} macros replaced
 * @throws Error if a macro cannot be resolved (path not found in projectConfig)
 */
export function resolveProjectMacrosInText(
  text: string,
  projectConfig?: Record<string, unknown>
): string {
  if (!text || !projectConfig) return text;

  return text.replace(/\{\{project\.([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(projectConfig, path);
    if (value === undefined) {
      throw new Error(
        `Cannot resolve ${match}. ` +
        `Check that project config has this path defined in index.json.`
      );
    }
    return value;
  });
}

export function resolveProjectMacros(
  variables: Record<string, string>,
  projectConfig?: Record<string, unknown>
): Record<string, string> {
  if (!variables) return variables;

  // Check if any variables contain {{project.*}} macros
  const projectMacroEntries = Object.entries(variables).filter(
    ([_, v]) => typeof v === 'string' && v.includes('{{project.')
  );

  // If macros exist but no projectConfig, throw clear error
  if (projectMacroEntries.length > 0 && !projectConfig) {
    const macroVars = projectMacroEntries.map(([k]) => k).join(', ');
    throw new Error(
      `Project config required to resolve color macros for: ${macroVars}. ` +
      `Ensure project has branding.colors configured in index.json.`
    );
  }

  if (!projectConfig) return variables;

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    const match = value.match(/\{\{project\.([^}]+)\}\}/);
    if (match) {
      const path = match[1]; // e.g., "branding.colors.primary"
      const resolvedValue = getNestedValue(projectConfig, path);

      // Throw error if macro can't be resolved
      if (resolvedValue === undefined) {
        throw new Error(
          `Cannot resolve {{project.${path}}} for '${key}'. ` +
          `Check that project config has branding.colors defined in index.json.`
        );
      }

      resolved[key] = resolvedValue;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
