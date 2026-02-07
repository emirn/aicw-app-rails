/**
 * File/folder constants for article folder structure
 */

/** Article metadata file (JSON format) */
export const META_FILE = 'meta.json';

/** Legacy metadata file (YAML frontmatter, for migration) */
export const LEGACY_META_FILE = 'meta.md';

/** Project configuration file (JSON format) */
export const PROJECT_CONFIG_FILE = '_project.json';

/** Legacy project config file (YAML, for migration) */
export const LEGACY_PROJECT_CONFIG_FILE = '_project.yaml';

/** @deprecated Use CONTENT_OVERRIDE_FILE instead */
export const ARTICLE_FILE = 'index.md';

/** Unified index file (new format: all data in one JSON file) */
export const INDEX_FILE = 'index.json';

/** Content override file (overrides index.json.content) */
export const CONTENT_OVERRIDE_FILE = 'content.md';

/** FAQ override file (overrides index.json.faq) */
export const FAQ_OVERRIDE_FILE = 'faq.md';

/** Content JSON-LD override file (overrides index.json.content_jsonld) */
export const CONTENT_JSONLD_OVERRIDE_FILE = 'content_jsonld.md';

/** FAQ JSON-LD override file (overrides index.json.faq_jsonld) */
export const FAQ_JSONLD_OVERRIDE_FILE = 'faq_jsonld.md';

/** Content fields that get per-field JSONLD */
export const JSONLD_CONTENT_FIELDS = ['content', 'faq'] as const;

/** Type for JSONLD content field names */
export type JsonldContentField = typeof JSONLD_CONTENT_FIELDS[number];

/** Version history directory */
export const HISTORY_DIR = '_history';

/**
 * Fields that are serialized to separate .md files for dev convenience.
 * When UnifiedSerializer writes, these fields are automatically synced to {field}.md
 * These .md files are write-only — never read back as overrides.
 */
export const SERIALIZED_FIELDS = ['content', 'faq', 'content_jsonld', 'faq_jsonld'] as const;

/** Type for serialized field names */
export type SerializedField = typeof SERIALIZED_FIELDS[number];

/** Map of field name to override filename */
export const SERIALIZED_FIELD_FILES: Record<SerializedField, string> = {
  content: 'content.md',
  faq: 'faq.md',
  content_jsonld: 'content_jsonld.md',
  faq_jsonld: 'faq_jsonld.md',
};
