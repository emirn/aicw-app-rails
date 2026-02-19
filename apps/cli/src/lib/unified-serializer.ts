/**
 * Unified Serializer for Folder-Based Data Storage
 *
 * All data is read exclusively from index.json.
 * `.md` files (content.md, faq.md, etc.) are write-only — synced from index.json
 * on every write for dev convenience and easier code review, but never read back.
 */

import { promises as fs } from 'fs';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { ISerializerOptions, ISerializerMeta, SERIALIZED_FIELDS, SERIALIZED_FIELD_FILES } from '@blogpostgen/types';

/** JSON indentation for pretty printing */
const JSON_INDENT = 2;

/**
 * Result of a read operation
 */
export interface IReadResult<T> {
  /** The merged data (null if index.json doesn't exist) */
  data: T | null;
  /** Metadata about the read operation */
  meta: ISerializerMeta;
}

/**
 * Unified serializer for folder-based data storage with override file support
 */
export class UnifiedSerializer<T extends Record<string, any>> {
  private readonly folderPath: string;
  private readonly baseFilename: string;
  private readonly syncOverrides: boolean;

  constructor(folderPath: string, options?: ISerializerOptions) {
    this.folderPath = folderPath;
    this.baseFilename = options?.baseFilename ?? 'index';
    this.syncOverrides = options?.syncOverrides ?? true;
  }

  /**
   * Get the path to the base JSON file
   */
  private getIndexPath(): string {
    return path.join(this.folderPath, `${this.baseFilename}.json`);
  }

  /**
   * Check if the folder and index.json exist
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.getIndexPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect existing override files in the folder
   *
   * @returns Map of field name to override file path
   */
  async detectOverrides(): Promise<Map<string, string>> {
    const overrides = new Map<string, string>();

    try {
      const entries = await fs.readdir(this.folderPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const filename = entry.name;
        const indexFilename = `${this.baseFilename}.json`;

        // Skip the base index file
        if (filename === indexFilename) continue;

        // Check for .md files (string overrides)
        if (filename.endsWith('.md')) {
          const fieldName = filename.slice(0, -3); // Remove .md
          if (fieldName && !fieldName.startsWith('_')) {
            overrides.set(fieldName, path.join(this.folderPath, filename));
          }
        }

        // Check for .json files (object/array overrides)
        if (filename.endsWith('.json')) {
          const fieldName = filename.slice(0, -5); // Remove .json
          if (fieldName && !fieldName.startsWith('_')) {
            overrides.set(fieldName, path.join(this.folderPath, filename));
          }
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }

    return overrides;
  }

  /**
   * Read data exclusively from index.json.
   * .md files are write-only and never read back as overrides.
   */
  async read(): Promise<IReadResult<T>> {
    const meta: ISerializerMeta = {
      basePath: this.folderPath,
      overriddenFields: [],
      overrideFiles: new Map(),
    };

    const indexPath = this.getIndexPath();
    let baseData: T | null = null;

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      baseData = JSON.parse(content) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { data: null, meta };
      }
      if (err instanceof SyntaxError) {
        throw new Error(`Invalid JSON in ${indexPath}: ${err.message}`);
      }
      throw err;
    }

    return { data: baseData, meta };
  }

  /**
   * Write data to index.json and sync override files
   *
   * Algorithm:
   * 1. Auto-increment version and updated_at (if present in data)
   * 2. Acquire .lock file (fail if another process is writing)
   * 3. Write full data to index.json (always)
   * 4. Auto-create/sync override files for SERIALIZED_FIELDS (content, faq, content_jsonld, faq_jsonld)
   * 5. Sync any OTHER existing override files (for extensibility)
   * 6. Release .lock file
   */
  async write(data: T): Promise<void> {
    // Ensure folder exists
    await fs.mkdir(this.folderPath, { recursive: true });

    // Auto-increment version and updated_at if present on data object
    const d = data as Record<string, any>;
    if ('version' in d) {
      d.version = (typeof d.version === 'number' ? d.version : 0) + 1;
    }
    if ('updated_at' in d) {
      d.updated_at = new Date().toISOString();
    }

    // Acquire .lock file to prevent concurrent writes
    const lockPath = path.join(this.folderPath, '.lock');

    if (existsSync(lockPath)) {
      throw new Error(
        `Write conflict: another process is writing to ${this.folderPath}. ` +
        `If stale, remove the .lock file manually.`
      );
    }

    try {
      writeFileSync(lockPath, '', { flag: 'wx' }); // atomic create-or-fail
    } catch {
      throw new Error(
        `Write conflict: another process is writing to ${this.folderPath}. ` +
        `If stale, remove the .lock file manually.`
      );
    }

    try {
      // Write full data to index.json
      const indexPath = this.getIndexPath();
      await fs.writeFile(indexPath, JSON.stringify(data, null, JSON_INDENT) + '\n', 'utf-8');

      // Auto-create/sync override files for SERIALIZED_FIELDS
      for (const field of SERIALIZED_FIELDS) {
        const value = (data as any)[field];
        if (value && typeof value === 'string' && value.trim()) {
          const filePath = path.join(this.folderPath, SERIALIZED_FIELD_FILES[field]);
          try {
            await fs.writeFile(filePath, value, 'utf-8');
          } catch (err) {
            console.error(`Warning: Failed to write ${SERIALIZED_FIELD_FILES[field]}: ${err}`);
          }
        }
      }

      // Sync any OTHER existing override files (non-SERIALIZED_FIELDS) if enabled
      if (this.syncOverrides) {
        const overrides = await this.detectOverrides();
        const serializedFieldSet = new Set<string>(SERIALIZED_FIELDS);

        for (const [fieldName, filePath] of overrides) {
          // Skip SERIALIZED_FIELDS - already handled above
          if (serializedFieldSet.has(fieldName)) {
            continue;
          }

          const value = (data as any)[fieldName];

          if (value === undefined) {
            // Field doesn't exist in data anymore - leave override file as-is
            // (user may have intentionally removed it from index.json)
            continue;
          }

          try {
            if (filePath.endsWith('.md')) {
              // String override - write content if value is string
              if (typeof value === 'string') {
                await fs.writeFile(filePath, value, 'utf-8');
              }
            } else if (filePath.endsWith('.json')) {
              // JSON override - write formatted JSON
              await fs.writeFile(filePath, JSON.stringify(value, null, JSON_INDENT) + '\n', 'utf-8');
            }
          } catch (err) {
            // Best effort sync - don't fail the write if override sync fails
            console.error(`Warning: Failed to sync override file ${filePath}: ${err}`);
          }
        }
      }
    } finally {
      // Release .lock file
      try { unlinkSync(lockPath); } catch {}
    }
  }

  /**
   * Update data with partial changes
   *
   * @param updates - Partial object with fields to update
   * @returns Updated full data
   */
  async update(updates: Partial<T>): Promise<T> {
    const { data: existing } = await this.read();
    const merged = { ...(existing || {}), ...updates } as T;
    await this.write(merged);
    return merged;
  }

  /**
   * Create an override file for a specific attribute
   *
   * This extracts a field from index.json into a separate file.
   * The field remains in index.json, but the override file takes precedence.
   *
   * @param fieldName - Name of the field to extract
   * @param extension - File extension (.md for strings, .json for objects/arrays)
   */
  async createOverride(fieldName: string, extension: '.md' | '.json'): Promise<string | null> {
    const { data } = await this.read();
    if (!data) return null;

    const value = (data as any)[fieldName];
    if (value === undefined) return null;

    const overridePath = path.join(this.folderPath, `${fieldName}${extension}`);

    if (extension === '.md') {
      if (typeof value !== 'string') {
        throw new Error(`Cannot create .md override for non-string field "${fieldName}"`);
      }
      await fs.writeFile(overridePath, value, 'utf-8');
    } else {
      await fs.writeFile(overridePath, JSON.stringify(value, null, JSON_INDENT) + '\n', 'utf-8');
    }

    return overridePath;
  }

  /**
   * Remove an override file (revert to index.json value)
   *
   * @param fieldName - Name of the field override to remove
   */
  async removeOverride(fieldName: string): Promise<boolean> {
    const overrides = await this.detectOverrides();
    const overridePath = overrides.get(fieldName);

    if (!overridePath) return false;

    try {
      await fs.unlink(overridePath);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Migration Utilities
// ============================================================================

/**
 * Migrate an article folder from old format (meta.json + index.md) to new format (index.json + content.md)
 *
 * Old format:
 * - meta.json: Article metadata
 * - index.md: Article content (now renamed to content.md)
 *
 * New format:
 * - index.json: All data including content
 * - content.md: Override for content field
 *
 * @param folderPath - Absolute path to article folder
 * @returns true if migration was performed, false if already migrated or no data
 */
export async function migrateArticleFolder(folderPath: string): Promise<boolean> {
  const metaPath = path.join(folderPath, 'meta.json');
  const indexPath = path.join(folderPath, 'index.json');
  const contentPath = path.join(folderPath, 'content.md');
  const legacyMetaPath = path.join(folderPath, 'meta.md');

  // Check if already migrated (index.json exists)
  try {
    await fs.access(indexPath);
    return false; // Already migrated
  } catch {
    // Continue with migration
  }

  // Try to read existing meta.json or legacy meta.md
  let meta: Record<string, any> | null = null;

  try {
    const content = await fs.readFile(metaPath, 'utf-8');
    meta = JSON.parse(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    // Try legacy meta.md (YAML frontmatter)
    try {
      // For simplicity, we just check if meta.md exists
      // Full YAML parsing would require js-yaml dependency
      await fs.access(legacyMetaPath);
      // Can't easily migrate YAML without dependency, skip
      return false;
    } catch {
      // No metadata found
      return false;
    }
  }

  if (!meta) return false;

  // Read content from content.md (was index.md, already renamed)
  let content: string | null = null;
  try {
    content = await fs.readFile(contentPath, 'utf-8');
  } catch {
    // No content file
  }

  // Build unified data with content included
  const unifiedData: Record<string, any> = {
    ...meta,
  };

  if (content !== null) {
    unifiedData.content = content;
  }

  // Write index.json
  await fs.writeFile(indexPath, JSON.stringify(unifiedData, null, JSON_INDENT) + '\n', 'utf-8');

  // content.md already exists as override file (was renamed from index.md)
  // meta.json can be deleted or kept for backup - we'll keep it for safety

  return true;
}

/**
 * Migrate a project folder from old format (_project.json) to new format (index.json)
 *
 * Old format:
 * - _project.json: Project configuration
 *
 * New format:
 * - index.json: Project configuration
 * - description.md: Optional override
 * - brand_voice.md: Optional override
 *
 * @param projectPath - Absolute path to project folder
 * @returns true if migration was performed, false if already migrated or no data
 */
export async function migrateProjectFolder(projectPath: string): Promise<boolean> {
  const oldConfigPath = path.join(projectPath, '_project.json');
  const newConfigPath = path.join(projectPath, 'index.json');
  const legacyYamlPath = path.join(projectPath, '_project.yaml');

  // Check if already migrated (index.json exists)
  try {
    await fs.access(newConfigPath);
    return false; // Already migrated
  } catch {
    // Continue with migration
  }

  // Try to read existing _project.json
  let config: Record<string, any> | null = null;

  try {
    const content = await fs.readFile(oldConfigPath, 'utf-8');
    config = JSON.parse(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    // Try legacy _project.yaml
    try {
      await fs.access(legacyYamlPath);
      // Can't easily migrate YAML without dependency, skip
      return false;
    } catch {
      // No config found
      return false;
    }
  }

  if (!config) return false;

  // Write index.json
  await fs.writeFile(newConfigPath, JSON.stringify(config, null, JSON_INDENT) + '\n', 'utf-8');

  // Optionally create override files for long text fields
  // (We don't auto-create these; user can use createOverride() if desired)

  return true;
}

/**
 * Check if a folder uses the new unified format
 *
 * @param folderPath - Absolute path to folder
 * @returns true if index.json exists
 */
export async function isUnifiedFormat(folderPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(folderPath, 'index.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a folder uses the old article format
 *
 * @param folderPath - Absolute path to folder
 * @returns true if meta.json exists
 */
export async function isOldArticleFormat(folderPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(folderPath, 'meta.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a folder uses the old project format
 *
 * @param folderPath - Absolute path to folder
 * @returns true if _project.json exists
 */
export async function isOldProjectFormat(folderPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(folderPath, '_project.json'));
    return true;
  } catch {
    return false;
  }
}
