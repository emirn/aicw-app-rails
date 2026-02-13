/**
 * Asset Verifier Utility
 *
 * Verifies that local/relative image paths referenced in article content
 * and metadata actually exist on disk.
 * Also validates hero image dimensions (minimum 1200px width for Google Discover).
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Source of the asset reference
 */
export type AssetSource = 'meta_image_hero' | 'meta_image_og' | 'content_image';

/**
 * Information about a missing asset
 */
export interface MissingAsset {
  /** The relative path as referenced in the article */
  path: string;
  /** Where the reference was found */
  source: AssetSource;
  /** The resolved absolute path that was checked */
  absolutePath: string;
}

/**
 * Warning about an asset that exists but has issues
 */
export interface AssetWarning {
  /** The relative path as referenced in the article */
  path: string;
  /** Where the reference was found */
  source: AssetSource;
  /** Warning message */
  message: string;
}

/** Minimum hero image width for Google Discover eligibility */
const MIN_HERO_WIDTH = 1200;

/**
 * Result of asset verification
 */
export interface AssetVerificationResult {
  /** Whether all assets exist */
  success: boolean;
  /** Total number of asset paths checked */
  totalChecked: number;
  /** Number of assets that exist */
  passed: number;
  /** List of missing assets */
  missing: MissingAsset[];
  /** List of asset warnings (e.g., hero image too small) */
  warnings: AssetWarning[];
}

/**
 * Regex to find local images in markdown content.
 * Matches ![alt](path) where path does NOT start with http://, https://, or data:
 */
const LOCAL_IMAGE_REGEX = /!\[([^\]]*)\]\((?!https?:\/\/|data:)([^)]+)\)/g;

/**
 * Check if a file exists at the given path
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify that all local asset paths in article content and metadata exist on disk.
 *
 * @param projectRoot - The root directory of the project
 * @param content - The article markdown content
 * @param meta - Article metadata containing image_hero and image_og paths
 * @returns Verification result with list of any missing assets
 */
export async function verifyAssets(
  projectRoot: string,
  content: string,
  meta: { image_hero?: string; image_og?: string }
): Promise<AssetVerificationResult> {
  const assetsToCheck: Array<{ path: string; source: AssetSource }> = [];

  // Check meta fields
  if (meta.image_hero) {
    assetsToCheck.push({ path: meta.image_hero, source: 'meta_image_hero' });
  }
  if (meta.image_og) {
    assetsToCheck.push({ path: meta.image_og, source: 'meta_image_og' });
  }

  // Find local images in content
  const matches = content.matchAll(LOCAL_IMAGE_REGEX);
  for (const match of matches) {
    const imagePath = match[2].trim();
    // Skip empty paths and anchors
    if (imagePath && !imagePath.startsWith('#')) {
      assetsToCheck.push({ path: imagePath, source: 'content_image' });
    }
  }

  // Deduplicate by path (keep first occurrence)
  const seen = new Set<string>();
  const uniqueAssets = assetsToCheck.filter((asset) => {
    if (seen.has(asset.path)) return false;
    seen.add(asset.path);
    return true;
  });

  const missing: MissingAsset[] = [];
  const warnings: AssetWarning[] = [];

  // Check each asset
  for (const asset of uniqueAssets) {
    // Resolve path relative to project root
    // Remove leading slash if present for path.join
    const relativePath = asset.path.replace(/^\//, '');
    const absolutePath = path.join(projectRoot, relativePath);

    const exists = await fileExists(absolutePath);
    if (!exists) {
      missing.push({
        path: asset.path,
        source: asset.source,
        absolutePath,
      });
    } else if (asset.source === 'meta_image_hero') {
      // Validate hero image width (minimum 1200px for Google Discover)
      try {
        const sharp = (await import('sharp')).default;
        const metadata = await sharp(absolutePath).metadata();
        if (metadata.width && metadata.width < MIN_HERO_WIDTH) {
          warnings.push({
            path: asset.path,
            source: asset.source,
            message: `Hero image width is ${metadata.width}px (minimum ${MIN_HERO_WIDTH}px required for Google Discover)`,
          });
        }
      } catch {
        // sharp not available or image unreadable — skip dimension check
      }
    }
  }

  return {
    success: missing.length === 0,
    totalChecked: uniqueAssets.length,
    passed: uniqueAssets.length - missing.length,
    missing,
    warnings,
  };
}
