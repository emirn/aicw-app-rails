import fs from 'node:fs/promises';
import path from 'node:path';
import { hash as blake3hash } from 'blake3';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Cloudflare API client for Pages deployments
 * Replaces wrangler CLI with direct REST API calls
 *
 * Uses the Pages Direct Upload API which accepts multipart/form-data
 * with a manifest and file contents.
 */

/**
 * Get auth headers for Cloudflare API
 */
function getAuthHeaders(apiToken) {
  return {
    'Authorization': `Bearer ${apiToken}`
  };
}

/**
 * Calculate BLAKE3 hash of file content matching Cloudflare Pages Direct Upload format.
 * Format: blake3(base64(content) + extension).slice(0, 32)
 * Based on: https://github.com/adamburgess/cloudflare-pages-direct-uploader
 * @param {Buffer} buffer - File content
 * @param {string} filepath - File path (used to extract extension from basename)
 * @returns {string} 32-character hex hash
 */
function hashFileContent(buffer, filepath) {
  const base64Content = buffer.toString('base64');
  // Use basename to get just the filename, then extract extension without dot
  const filename = path.basename(filepath);
  const extension = path.extname(filename).substring(1);
  const hashInput = base64Content + extension;
  return blake3hash(hashInput).toString('hex').slice(0, 32);
}

/**
 * Walk a directory recursively and create an asset manifest
 * @param {string} directory - Path to the directory to scan
 * @returns {Promise<{manifest: Object, files: Array}>} Manifest and file list
 */
export async function createAssetManifest(directory) {
  const manifest = {};
  const files = [];

  async function walkDir(dir, basePath = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walkDir(fullPath, relativePath);
      } else if (entry.isFile()) {
        const buffer = await fs.readFile(fullPath);
        const hash = hashFileContent(buffer, relativePath);
        const assetPath = '/' + relativePath;

        manifest[assetPath] = hash;

        files.push({
          path: assetPath,
          hash,
          content: buffer,
          size: buffer.length
        });
      }
    }
  }

  await walkDir(directory);

  return { manifest, files };
}

/**
 * Deploy to Cloudflare Pages using Direct Upload API
 *
 * This uploads all files in a single multipart/form-data request
 *
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.apiToken - Cloudflare API token
 * @param {Object} options.manifest - Asset manifest from createAssetManifest
 * @param {Array} options.files - Array of file objects from createAssetManifest
 * @param {string} options.branch - Git branch name (default: 'main')
 * @param {Function} options.logFn - Optional logging function
 * @returns {Promise<Object>} Deployment result
 */
export async function deployToPages(options) {
  const {
    accountId,
    projectName,
    apiToken,
    manifest,
    files,
    branch = 'main',
    logFn = console.log
  } = options;

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/deployments`;

  // Build multipart form data
  const formData = new FormData();

  // Add metadata
  formData.append('branch', branch);
  formData.append('manifest', JSON.stringify(manifest));

  // Add all files with their hash as the field name
  // Files need to be uploaded with their hash as the key
  const hashToFile = new Map();
  for (const file of files) {
    if (!hashToFile.has(file.hash)) {
      hashToFile.set(file.hash, file);
    }
  }

  logFn(`Uploading ${hashToFile.size} unique files...`);

  for (const [hash, file] of hashToFile) {
    // Create a Blob from the buffer for FormData
    const blob = new Blob([file.content]);
    formData.append(hash, blob, file.path.substring(1)); // Remove leading /
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(apiToken),
    body: formData
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`;
    throw new Error(`Failed to deploy: ${errorMsg}`);
  }

  return data.result;
}

/**
 * Get deployment status
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.deploymentId - Deployment ID
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object>} Deployment status
 */
export async function getDeploymentStatus(options) {
  const { accountId, projectName, deploymentId, apiToken } = options;

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to get deployment status: ${errorMsg}`);
  }

  return data.result;
}

/**
 * Get or create a Pages project
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object>} Project info
 */
export async function ensureProject(options) {
  const { accountId, projectName, apiToken } = options;

  // First try to get existing project
  const getUrl = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}`;

  const getResponse = await fetch(getUrl, {
    method: 'GET',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    }
  });

  const getData = await getResponse.json();

  if (getData.success) {
    return { project: getData.result, created: false };
  }

  // Project doesn't exist, create it
  const createUrl = `${CF_API_BASE}/accounts/${accountId}/pages/projects`;

  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: projectName,
      production_branch: 'main'
    })
  });

  const createData = await createResponse.json();

  if (!createData.success) {
    const errorMsg = createData.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to create project: ${errorMsg}`);
  }

  return { project: createData.result, created: true };
}

/**
 * List recent deployments for a project
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.apiToken - Cloudflare API token
 * @param {number} options.limit - Max number of deployments to return
 * @returns {Promise<Array>} Array of deployments
 */
export async function listDeployments(options) {
  const { accountId, projectName, apiToken, limit = 10 } = options;

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/deployments?per_page=${limit}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to list deployments: ${errorMsg}`);
  }

  return data.result;
}

/**
 * Retry a failed deployment
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.deploymentId - Deployment ID to retry
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object>} New deployment result
 */
export async function retryDeployment(options) {
  const { accountId, projectName, deploymentId, apiToken } = options;

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/retry`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to retry deployment: ${errorMsg}`);
  }

  return data.result;
}

/**
 * Rollback to a previous deployment
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.deploymentId - Deployment ID to rollback to
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object>} Rollback result
 */
export async function rollbackDeployment(options) {
  const { accountId, projectName, deploymentId, apiToken } = options;

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/rollback`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to rollback deployment: ${errorMsg}`);
  }

  return data.result;
}

/**
 * Add a custom domain to a Pages project
 *
 * This registers the domain with Cloudflare Pages, allowing it to serve the site.
 * For *.sites.aicw.io domains, the CNAME should already be set up.
 * For customer domains, they need to add a CNAME pointing to *.sites.aicw.io.
 *
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.domain - Domain to add (e.g., "blog-mysite-com.sites.aicw.io" or "blog.mysite.com")
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object>} Domain registration result
 */
export async function addCustomDomain(options) {
  const {
    accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
    projectName,
    domain,
    apiToken = process.env.CLOUDFLARE_API_TOKEN
  } = options;

  if (!accountId) throw new Error('accountId is required');
  if (!projectName) throw new Error('projectName is required');
  if (!domain) throw new Error('domain is required');
  if (!apiToken) throw new Error('apiToken is required');

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/domains`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: domain })
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`;
    throw new Error(`Failed to add custom domain: ${errorMsg}`);
  }

  return data.result;
}

/**
 * Remove a custom domain from a Pages project
 *
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.domain - Domain to remove
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object>} Deletion result
 */
export async function removeCustomDomain(options) {
  const {
    accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
    projectName,
    domain,
    apiToken = process.env.CLOUDFLARE_API_TOKEN
  } = options;

  if (!accountId) throw new Error('accountId is required');
  if (!projectName) throw new Error('projectName is required');
  if (!domain) throw new Error('domain is required');
  if (!apiToken) throw new Error('apiToken is required');

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/domains/${domain}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(apiToken)
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`;
    throw new Error(`Failed to remove custom domain: ${errorMsg}`);
  }

  return { deleted: true, domain };
}

/**
 * List all custom domains for a Pages project
 *
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Array>} Array of domain objects
 */
export async function listCustomDomains(options) {
  const {
    accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
    projectName,
    apiToken = process.env.CLOUDFLARE_API_TOKEN
  } = options;

  if (!accountId) throw new Error('accountId is required');
  if (!projectName) throw new Error('projectName is required');
  if (!apiToken) throw new Error('apiToken is required');

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/domains`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`;
    throw new Error(`Failed to list custom domains: ${errorMsg}`);
  }

  return data.result;
}

/**
 * Get custom domain status/details
 *
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.domain - Domain to check
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object>} Domain details including SSL status
 */
export async function getCustomDomainStatus(options) {
  const {
    accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
    projectName,
    domain,
    apiToken = process.env.CLOUDFLARE_API_TOKEN
  } = options;

  if (!accountId) throw new Error('accountId is required');
  if (!projectName) throw new Error('projectName is required');
  if (!domain) throw new Error('domain is required');
  if (!apiToken) throw new Error('apiToken is required');

  const url = `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/domains/${domain}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...getAuthHeaders(apiToken),
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`;
    throw new Error(`Failed to get domain status: ${errorMsg}`);
  }

  return data.result;
}

export default {
  createAssetManifest,
  deployToPages,
  getDeploymentStatus,
  ensureProject,
  listDeployments,
  retryDeployment,
  rollbackDeployment,
  addCustomDomain,
  removeCustomDomain,
  listCustomDomains,
  getCustomDomainStatus
};
