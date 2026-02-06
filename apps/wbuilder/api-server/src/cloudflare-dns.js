/**
 * Cloudflare DNS Management
 *
 * Manages DNS records for customer site subdomains on pgndr.com.
 * Adds/removes CNAME records pointing to Cloudflare Pages.
 */

import { SITES_BASE_DOMAIN, SITES_SUBDOMAIN_PREFIX } from './utils/normalize.js';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Get auth headers for Cloudflare API
 */
function getAuthHeaders(apiToken) {
  return {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Add a CNAME record for a sites.pgndr.com subdomain
 *
 * Creates: <projectName>.sites.pgndr.com → <projectName>.pages.dev
 *
 * @param {Object} options
 * @param {string} options.projectName - Project name (e.g., "prod-test-blog")
 * @param {string} options.target - Target hostname (e.g., "prod-test-blog.pages.dev")
 * @param {string} options.zoneId - Cloudflare Zone ID for pgndr.com (from env: CLOUDFLARE_AICW_ZONE_ID)
 * @param {string} options.apiToken - Cloudflare API token
 * @param {boolean} options.proxied - Whether to proxy through Cloudflare (default: true)
 * @returns {Promise<Object>} DNS record result
 */
export async function addSitesCname(options) {
  const {
    projectName,
    target,
    zoneId = process.env.CLOUDFLARE_AICW_ZONE_ID,
    apiToken = process.env.CLOUDFLARE_API_TOKEN,
    proxied = true
  } = options;

  if (!projectName) throw new Error('projectName is required');
  if (!target) throw new Error('target is required');
  if (!zoneId) throw new Error('zoneId is required (set CLOUDFLARE_AICW_ZONE_ID env var)');
  if (!apiToken) throw new Error('apiToken is required');

  // The subdomain name (without the base domain)
  // If SITES_SUBDOMAIN_PREFIX is empty, use projectName directly
  const name = SITES_SUBDOMAIN_PREFIX ? `${projectName}.${SITES_SUBDOMAIN_PREFIX}` : projectName;

  // First check if record already exists
  const existingRecord = await findDnsRecord({ name, zoneId, apiToken });

  if (existingRecord) {
    // Update existing record
    const url = `${CF_API_BASE}/zones/${zoneId}/dns_records/${existingRecord.id}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: getAuthHeaders(apiToken),
      body: JSON.stringify({
        type: 'CNAME',
        name,
        content: target,
        proxied,
        ttl: 1 // Auto TTL when proxied
      })
    });

    const data = await response.json();

    if (!data.success) {
      const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
      throw new Error(`Failed to update DNS record: ${errorMsg}`);
    }

    return { record: data.result, updated: true };
  }

  // Create new record
  const url = `${CF_API_BASE}/zones/${zoneId}/dns_records`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(apiToken),
    body: JSON.stringify({
      type: 'CNAME',
      name,
      content: target,
      proxied,
      ttl: 1 // Auto TTL when proxied
    })
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to create DNS record: ${errorMsg}`);
  }

  return { record: data.result, created: true };
}

/**
 * Remove a CNAME record for a sites.aicw.io subdomain
 *
 * @param {Object} options
 * @param {string} options.projectName - Project name (e.g., "blog-mysite-com")
 * @param {string} options.zoneId - Cloudflare Zone ID for aicw.io
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object>} Deletion result
 */
export async function removeSitesCname(options) {
  const {
    projectName,
    zoneId = process.env.CLOUDFLARE_AICW_ZONE_ID,
    apiToken = process.env.CLOUDFLARE_API_TOKEN
  } = options;

  if (!projectName) throw new Error('projectName is required');
  if (!zoneId) throw new Error('zoneId is required');
  if (!apiToken) throw new Error('apiToken is required');

  const name = SITES_SUBDOMAIN_PREFIX ? `${projectName}.${SITES_SUBDOMAIN_PREFIX}` : projectName;
  const record = await findDnsRecord({ name, zoneId, apiToken });

  if (!record) {
    return { deleted: false, message: 'Record not found' };
  }

  const url = `${CF_API_BASE}/zones/${zoneId}/dns_records/${record.id}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(apiToken)
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to delete DNS record: ${errorMsg}`);
  }

  return { deleted: true, recordId: record.id };
}

/**
 * Find a DNS record by name
 *
 * @param {Object} options
 * @param {string} options.name - Record name (e.g., "blog-mysite-com.sites")
 * @param {string} options.zoneId - Cloudflare Zone ID
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Object|null>} DNS record or null if not found
 */
export async function findDnsRecord(options) {
  const { name, zoneId, apiToken } = options;

  // Append base domain for the full record name
  const fullName = name.endsWith(`.${SITES_BASE_DOMAIN}`) ? name : `${name}.${SITES_BASE_DOMAIN}`;

  const url = `${CF_API_BASE}/zones/${zoneId}/dns_records?name=${encodeURIComponent(fullName)}&type=CNAME`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(apiToken)
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to find DNS record: ${errorMsg}`);
  }

  return data.result?.[0] || null;
}

/**
 * List all sites.aicw.io CNAME records
 *
 * @param {Object} options
 * @param {string} options.zoneId - Cloudflare Zone ID
 * @param {string} options.apiToken - Cloudflare API token
 * @returns {Promise<Array>} Array of DNS records
 */
export async function listSitesCnames(options) {
  const {
    zoneId = process.env.CLOUDFLARE_AICW_ZONE_ID,
    apiToken = process.env.CLOUDFLARE_API_TOKEN
  } = options || {};

  if (!zoneId) throw new Error('zoneId is required');
  if (!apiToken) throw new Error('apiToken is required');

  // Search for all *.sites.aicw.io records
  const url = `${CF_API_BASE}/zones/${zoneId}/dns_records?type=CNAME&per_page=100`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(apiToken)
  });

  const data = await response.json();

  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Failed to list DNS records: ${errorMsg}`);
  }

  // Filter to only *.pgndr.com records (or *.sites.pgndr.com if prefix is set)
  const suffix = SITES_SUBDOMAIN_PREFIX
    ? `.${SITES_SUBDOMAIN_PREFIX}.${SITES_BASE_DOMAIN}`
    : `.${SITES_BASE_DOMAIN}`;
  return data.result.filter(record => record.name.endsWith(suffix));
}

export default {
  addSitesCname,
  removeSitesCname,
  findDnsRecord,
  listSitesCnames
};
