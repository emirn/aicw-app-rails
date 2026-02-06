import { IFileAsset } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Simple asset storage for preprocessed files
 * - Saves to ./assets/ directory
 * - Uses readable filenames: {original-name}-{short-hash}.json
 * - MD5 hash-based deduplication
 * - Strips base64 URL before saving (too large)
 */
export class AssetStore {
  private assetsDir: string;

  constructor(baseDir: string = './assets') {
    this.assetsDir = baseDir;
    this.ensureAssetsDir();
  }

  /**
   * Ensure assets directory exists
   */
  private ensureAssetsDir(): void {
    if (!fs.existsSync(this.assetsDir)) {
      fs.mkdirSync(this.assetsDir, { recursive: true });
    }
  }

  /**
   * Calculate MD5 hash of file buffer
   */
  static calculateHash(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Build readable filename: {original-name}-{short-hash}.json
   */
  private buildFilename(asset: IFileAsset): string {
    // Clean filename: remove extension and special chars
    const cleanName = path.parse(asset.filename).name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Use first 8 chars of hash
    const shortHash = asset.hash.substring(0, 8);

    return `${cleanName}-${shortHash}.json`;
  }

  /**
   * Get full path for asset file
   */
  private getAssetPath(asset: IFileAsset): string {
    const filename = this.buildFilename(asset);
    return path.join(this.assetsDir, filename);
  }

  /**
   * Check if asset already exists by hash
   */
  exists(hash: string): boolean {
    // Search for file with matching hash in filename
    const files = fs.readdirSync(this.assetsDir);
    const shortHash = hash.substring(0, 8);
    return files.some(file => file.includes(`-${shortHash}.json`));
  }

  /**
   * Load asset by hash (returns null if not found)
   */
  load(hash: string): IFileAsset | null {
    const files = fs.readdirSync(this.assetsDir);
    const shortHash = hash.substring(0, 8);
    const filename = files.find(file => file.includes(`-${shortHash}.json`));

    if (!filename) {
      return null;
    }

    const filepath = path.join(this.assetsDir, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content) as IFileAsset;
  }

  /**
   * Save asset (strips base64 URL before saving)
   */
  save(asset: IFileAsset): void {
    // Create copy without URL (too large for storage)
    const assetToSave = { ...asset };
    delete assetToSave.url;

    const filepath = this.getAssetPath(asset);
    fs.writeFileSync(filepath, JSON.stringify(assetToSave, null, 2), 'utf-8');
  }

  /**
   * Get all stored assets
   */
  listAll(): IFileAsset[] {
    const files = fs.readdirSync(this.assetsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    return jsonFiles.map(filename => {
      const filepath = path.join(this.assetsDir, filename);
      const content = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(content) as IFileAsset;
    });
  }
}
