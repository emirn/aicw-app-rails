import { spawn } from 'node:child_process';
import { ensureProject, addCustomDomain } from './cloudflare-api.js';
import { addSitesCname } from './cloudflare-dns.js';
import { getSitesHostname } from './utils/normalize.js';

/**
 * Deploy a directory to Cloudflare Pages using wrangler CLI
 *
 * Uses wrangler pages deploy which handles the complex Direct Upload API correctly.
 * This is more reliable than the direct API implementation.
 *
 * After deployment, if CLOUDFLARE_AICW_ZONE_ID is set, also:
 * 1. Adds a CNAME record: <projectName>.sites.aicw.io → <projectName>.pages.dev
 * 2. Registers <projectName>.sites.aicw.io as a custom domain on the Pages project
 *
 * @param {Object} options
 * @param {string} options.outputDir - Path to the built site directory (e.g., dist/)
 * @param {string} options.projectName - Cloudflare Pages project name
 * @param {string} options.accountId - Cloudflare account ID (from env or config)
 * @param {string} options.apiToken - Cloudflare API token (from env or config)
 * @param {string} options.zoneId - Cloudflare Zone ID for aicw.io (from env: CLOUDFLARE_AICW_ZONE_ID)
 * @param {string} options.branch - Git branch name for the deployment (default: 'main')
 * @param {boolean} options.setupSitesSubdomain - Whether to set up *.sites.aicw.io subdomain (default: true if zoneId available)
 * @param {Function} options.logFn - Optional logging function
 * @returns {Promise<Object>} Deployment result with URL, ID, and metadata
 */
export async function deployToCloudflarePages(options) {
  const {
    outputDir,
    projectName,
    accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken = process.env.CLOUDFLARE_API_TOKEN,
    zoneId = process.env.CLOUDFLARE_AICW_ZONE_ID,
    branch = 'main',
    setupSitesSubdomain = true,
    logFn = console.log
  } = options;

  // Validate required parameters
  if (!outputDir) throw new Error('outputDir is required');
  if (!projectName) throw new Error('projectName is required');
  if (!accountId) throw new Error('accountId is required (set CLOUDFLARE_ACCOUNT_ID env var or pass explicitly)');
  if (!apiToken) throw new Error('apiToken is required (set CLOUDFLARE_API_TOKEN env var or pass explicitly)');

  const startTime = Date.now();

  try {
    // 1. Ensure project exists (create if needed)
    logFn(`Ensuring project "${projectName}" exists...`);
    const { project, created } = await ensureProject({ accountId, projectName, apiToken });
    if (created) {
      logFn(`Created new Pages project: ${projectName}`);
    } else {
      logFn(`Using existing project: ${projectName}`);
    }

    // 2. Deploy using wrangler CLI
    logFn('Deploying to Cloudflare Pages via wrangler...');
    const result = await runWranglerDeploy({
      outputDir,
      projectName,
      accountId,
      apiToken,
      branch,
      logFn
    });

    // 3. Set up sites.aicw.io subdomain (if zone ID available)
    let sitesUrl = null;
    let sitesSubdomainSetup = null;

    if (setupSitesSubdomain && zoneId) {
      const sitesSubdomain = getSitesHostname(projectName);
      const pagesDevTarget = `${projectName}.pages.dev`;

      logFn(`Setting up subdomain: ${sitesSubdomain}`);

      try {
        // 3a. Add CNAME record
        logFn(`Adding DNS CNAME: ${sitesSubdomain} → ${pagesDevTarget}`);
        const dnsResult = await addSitesCname({
          projectName,
          target: pagesDevTarget,
          zoneId,
          apiToken
        });
        logFn(`DNS ${dnsResult.created ? 'created' : 'updated'}: ${sitesSubdomain}`);

        // 3b. Register custom domain on Pages project
        logFn(`Registering custom domain: ${sitesSubdomain}`);
        try {
          await addCustomDomain({
            accountId,
            projectName,
            domain: sitesSubdomain,
            apiToken
          });
          logFn(`Custom domain registered: ${sitesSubdomain}`);
        } catch (domainError) {
          // Domain might already be registered - that's OK
          if (domainError.message.includes('already exists') ||
              domainError.message.includes('already been registered')) {
            logFn(`Custom domain already registered: ${sitesSubdomain}`);
          } else {
            throw domainError;
          }
        }

        sitesUrl = `https://${sitesSubdomain}`;
        sitesSubdomainSetup = {
          success: true,
          subdomain: sitesSubdomain,
          target: pagesDevTarget
        };
      } catch (sitesError) {
        logFn(`WARNING: Failed to set up sites subdomain: ${sitesError.message}`);
        sitesSubdomainSetup = {
          success: false,
          error: sitesError.message
        };
      }
    }

    const duration = Date.now() - startTime;

    // Return the sites.aicw.io URL as primary if available, otherwise pages.dev
    const primaryUrl = sitesUrl || result.url;
    logFn(`Deployment complete: ${primaryUrl}`);
    logFn(`Duration: ${formatDuration(duration)}`);

    return {
      success: true,
      url: primaryUrl,
      pagesDevUrl: result.url,
      sitesUrl,
      deploymentId: result.deploymentId,
      projectName,
      filesUploaded: result.filesUploaded,
      duration,
      deployment: result,
      sitesSubdomainSetup
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logFn(`ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message,
      duration
    };
  }
}

/**
 * Run wrangler pages deploy command
 */
async function runWranglerDeploy(options) {
  const { outputDir, projectName, accountId, apiToken, branch, logFn } = options;

  return new Promise((resolve, reject) => {
    const args = [
      'pages', 'deploy', outputDir,
      '--project-name', projectName,
      '--branch', branch,
      '--commit-dirty=true'
    ];

    logFn(`Running: wrangler ${args.join(' ')}`);

    const wrangler = spawn('wrangler', args, {
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: apiToken,
        CLOUDFLARE_ACCOUNT_ID: accountId
      },
      cwd: outputDir
    });

    let stdout = '';
    let stderr = '';

    wrangler.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Log upload progress
      if (text.includes('Uploading')) {
        logFn(text.trim());
      }
    });

    wrangler.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    wrangler.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`wrangler failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      // Parse output to extract URL and deployment info
      // Example output: "✨ Deployment complete! Take a peek over at https://649b3841.test-site-local.pages.dev"
      const urlMatch = stdout.match(/https:\/\/([a-f0-9]+)\.([a-z0-9-]+)\.pages\.dev/);
      const filesMatch = stdout.match(/Uploaded (\d+) files/);

      const url = urlMatch ? urlMatch[0] : `https://${projectName}.pages.dev`;
      const deploymentId = urlMatch ? urlMatch[1] : null;
      const filesUploaded = filesMatch ? parseInt(filesMatch[1], 10) : null;

      resolve({
        url,
        deploymentId,
        filesUploaded,
        stdout,
        stderr
      });
    });

    wrangler.on('error', (error) => {
      reject(new Error(`Failed to spawn wrangler: ${error.message}. Is wrangler installed globally?`));
    });
  });
}

/**
 * Rollback to a previous deployment
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare account ID
 * @param {string} options.projectName - Pages project name
 * @param {string} options.deploymentId - ID of deployment to rollback to
 * @param {string} options.apiToken - Cloudflare API token
 */
export async function rollbackDeployment(options) {
  const { accountId, projectName, deploymentId, apiToken } = options;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/rollback`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
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

// Utility functions
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default {
  deployToCloudflarePages,
  rollbackDeployment
};
