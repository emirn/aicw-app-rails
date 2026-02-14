import { ActionConfigMap, IActionConfig, ActionMode } from '../types';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const loadPerActionConfigs = (): ActionConfigMap => {
  const map: ActionConfigMap = {};
  const baseDir = join(__dirname, '..', '..', 'config', 'actions');
  try {
    const dirs = readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      const name = dir.name as keyof ActionConfigMap;
      const dirPath = join(baseDir, name);
      const cfgPath = join(dirPath, 'config.json');
      if (!existsSync(cfgPath)) {
        // Not an action folder (no config.json)
        continue;
      }
      try {
        const raw = readFileSync(cfgPath, 'utf8');
        const cfg = JSON.parse(raw) as IActionConfig;

        // Always use prompt.md (no template field needed)
        const promptPath = join(dirPath, 'prompt.md');

        // Read prompt.md content (reference only)
        const promptContent = existsSync(promptPath) ? readFileSync(promptPath, 'utf8') : null;

        map[name] = {
          ai_provider: cfg.ai_provider || 'openrouter',
          ai_model_id: cfg.ai_model_id,
          ai_base_url: cfg.ai_base_url,
          output_mode: cfg.output_mode,
          description: cfg.description,
          web_search: cfg.web_search,
          local: cfg.local,
          forcible: cfg.forcible,
          // Pricing (co-located with model/provider)
          pricing: cfg.pricing,
          // Custom prompt/config support
          supports_custom_prompt: cfg.supports_custom_prompt,
          supports_custom_config: cfg.supports_custom_config,
          variables: cfg.variables,
          // Colors field for project branding macros (e.g., {{project.branding.colors.primary}})
          colors: (cfg as any).colors,
          // Internal: absolute path to prompt.md
          prompt_path: promptPath,
          // Sync fields for CLI auto-sync
          prompt_content: promptContent,
          config_json_content: raw,
          config_json_path: `config/actions/${name}/config.json`,
        } as IActionConfig;
      } catch (e: any) {
        console.warn(`ACTION_CONFIG: Failed to load config for action '${name}': ${e.message}`);
        continue;
      }
    }
  } catch (e: any) {
    console.warn('ACTION_CONFIG: No per-action configs found:', e.message);
  }
  return map;
};

// Load per-action configs under config/actions/<action>/{config.json,prompt.md}
export const ACTION_CONFIG: ActionConfigMap = loadPerActionConfigs();

// Dynamically derive valid action modes from loaded configs (single source of truth)
export const VALID_ACTION_MODES: string[] = Object.keys(ACTION_CONFIG);

/**
 * Validate action mode against folder-derived config
 */
export function isValidActionMode(mode: unknown): boolean {
  return typeof mode === 'string' && VALID_ACTION_MODES.includes(mode);
}

/**
 * Result of action config validation
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate action configs at startup.
 *
 * Local actions (local: true or no prompt_path) are skipped.
 * Real actions must have their prompt.md files present.
 *
 * Returns errors for missing prompts instead of just logging warnings.
 */
export function validateActionConfig(log?: { info?: Function; warn?: Function }): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [mode, cfg] of Object.entries(ACTION_CONFIG)) {
    if (!cfg) {
      warnings.push(`Action '${mode}': no config found`);
      continue;
    }

    const config = cfg as IActionConfig;

    // Skip local actions (local: true)
    // These are implemented in code, not via AI prompts
    if (config.local) {
      log?.info?.({ mode }, 'Skipping local action (no prompt needed)');
      continue;
    }

    // Real action - prompt.md must exist
    if (config.prompt_path && !existsSync(config.prompt_path)) {
      errors.push(`Action '${mode}': prompt.md not found at ${config.prompt_path}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function ensureActionConfigForMode(mode: ActionMode) {
  const cfg = ACTION_CONFIG[mode];
  if (!cfg) throw new Error(`Missing action config for mode '${mode}'`);
  return cfg as IActionConfig;
}
