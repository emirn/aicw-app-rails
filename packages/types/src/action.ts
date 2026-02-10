/**
 * Action and configuration types
 */

export type ActionMode =
  | 'write_draft'
  | 'get_competitors'
  | 'website_info'
  | 'humanize_text'
  | 'humanize_text_random'
  | 'make_plan'
  | 'parse_plan'
  | 'add_images'
  | 'add_links'
  | 'add_internal_links'
  | 'add_external_links'
  | 'add_diagrams'
  | 'add_faq'
  | 'add_toc'
  | 'add_content_jsonld'
  | 'add_faq_jsonld'
  | 'fact_check'
  | 'improve_seo'
  | 'condense_text'
  | 'create_meta'
  | 'validate_format'
  | 'validate_links'
  | 'generate_image_hero'
  | 'generate_image_social'
  | 'generate_project_config';

export type OutputMode =
  | 'text_replace_all'
  | 'insert_content'
  | 'insert_content_top'
  | 'insert_content_bottom'
  | 'text_replace';

export interface IActionConfig {
  // Provider for this action's AI call
  ai_provider?: 'openrouter' | 'openai';
  // Direct model id for the chosen provider
  ai_model_id?: string;
  // Override default provider base URL (e.g., for Azure OpenAI or custom endpoints)
  ai_base_url?: string;
  output_mode: OutputMode;
  description: string;
  extra_templates?: string[];
  // Enable native web search (OpenAI gpt-4o-*-search-preview models)
  web_search?: boolean;
  // When true, action is handled locally without AI call (e.g., humanize_text_random)
  no_ai?: boolean;
  // When false, action cannot be used in force-enhance workflow (default: true)
  forcible?: boolean;
  // When true, allows per-project custom prompt templates (default: false)
  custom_prompt?: boolean;
  // Alias for custom_prompt (used in config.json files)
  supports_custom_prompt?: boolean;
  // When true, allows per-project config overrides with custom variables (default: false)
  supports_custom_config?: boolean;
  // Custom variables for prompt template (e.g., brand colors)
  variables?: Record<string, string>;
  // Color variables with {{project.*}} macros for branding (resolved at runtime)
  colors?: Record<string, string>;

  // === Internal fields (populated by server, not stored in config.json) ===
  // Absolute path to prompt.md (internal use only)
  prompt_path?: string;
  // Main prompt content (reference only, not synced to projects)
  prompt_content?: string | null;
  // custom.md content (synced to project when supports_custom_prompt: true)
  custom_content?: string | null;
  // Path for syncing: config/actions/<action>/custom.md
  custom_relative_path?: string;
  // Config JSON content and path for reference
  config_json_content?: string;
  config_json_path?: string;
}

/**
 * Custom prompt template loaded from project config
 */
export interface ICustomPrompt {
  /** Action this prompt applies to */
  action: ActionMode;
  /** Custom prompt template content */
  content: string;
}

export type ActionConfigMap = Partial<Record<ActionMode, IActionConfig>>;
