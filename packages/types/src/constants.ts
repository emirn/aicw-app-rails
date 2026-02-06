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

/** JSON-LD override file (overrides index.json.jsonld) */
export const JSONLD_OVERRIDE_FILE = 'jsonld.md';

/** Version history directory */
export const HISTORY_DIR = '_history';

/**
 * Fields that are serialized to separate .md files for easy editing.
 * When UnifiedSerializer writes, these fields are automatically synced to {field}.md
 * When reading, these .md files override the corresponding index.json field
 */
export const SERIALIZED_FIELDS = ['content', 'faq', 'jsonld'] as const;

/** Type for serialized field names */
export type SerializedField = typeof SERIALIZED_FIELDS[number];

/** Map of field name to override filename */
export const SERIALIZED_FIELD_FILES: Record<SerializedField, string> = {
  content: 'content.md',
  faq: 'faq.md',
  jsonld: 'jsonld.md',
};
