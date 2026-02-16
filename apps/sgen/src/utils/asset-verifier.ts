/**
 * Asset Verifier Utility
 *
 * Verifies that expected asset paths referenced in article content
 * and metadata exist. Works with a provided list of available assets
 * (passed from CLI) instead of direct filesystem access.
 */

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
}

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
}

/**
 * Regex to find local images in markdown content.
 * Matches ![alt](path) where path does NOT start with http://, https://, or data:
 */
const LOCAL_IMAGE_REGEX = /!\[([^\]]*)\]\((?!https?:\/\/|data:)([^)]+)\)/g;

/**
 * Verify that all local asset paths in article content and metadata exist.
 *
 * @param content - The article markdown content
 * @param meta - Article metadata containing image_hero and image_og paths
 * @param availableAssets - List of asset paths that exist on disk (provided by CLI)
 * @returns Verification result with list of any missing assets
 */
export function verifyAssets(
  content: string,
  meta: { image_hero?: string; image_og?: string },
  availableAssets: string[]
): AssetVerificationResult {
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
    if (imagePath && !imagePath.startsWith('#')) {
      assetsToCheck.push({ path: imagePath, source: 'content_image' });
    }
  }

  // Deduplicate by path
  const seen = new Set<string>();
  const uniqueAssets = assetsToCheck.filter((asset) => {
    if (seen.has(asset.path)) return false;
    seen.add(asset.path);
    return true;
  });

  // Normalize paths for comparison (strip leading /)
  const normalizedAvailable = new Set(
    availableAssets.map(p => p.replace(/^\//, ''))
  );

  const missing: MissingAsset[] = [];

  for (const asset of uniqueAssets) {
    const normalizedPath = asset.path.replace(/^\//, '');
    if (!normalizedAvailable.has(normalizedPath)) {
      missing.push({
        path: asset.path,
        source: asset.source,
      });
    }
  }

  return {
    success: missing.length === 0,
    totalChecked: uniqueAssets.length,
    passed: uniqueAssets.length - missing.length,
    missing,
  };
}
