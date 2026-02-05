/**
 * AICW Tracking Script - Source File
 *
 * TO MINIFY THIS FILE:
 * Run: npm run minify:tracker
 *
 * This will automatically minify this file and save to: public/aicw-view.min.js
 */

(function() {
  'use strict';

  // Configuration
  
  const CONFIG_ENDPOINT = 'https://vuzocqdmeetootjqnejp.supabase.co/functions/v1/view';
  const CONFIG_SCRIPT_NAME = 'aicw-view';

  // NOTE: Bot detection removed from client - now handled server-side
  // This allows tracking of browser-based bots (AI agents, etc.)

  const SPA_ROUTE_CHANGE_DEBOUNCE_TIME_MS = 100;

  // String length limits
  const MAX_STRING_LENGTH = 2000;
  const MAX_TEXT_FRAGMENT_LENGTH = 2000;
  const UTM_PARAM_MAX_LENGTH = 255;

  // Engagement tracking thresholds
  const ENGAGEMENT_THRESHOLD_MS = 3000;
  const SCROLL_THROTTLE_MS = 100;
  const LAZY_LOAD_CHECK_INTERVAL_MS = 200;
  const LAZY_LOAD_CHECK_COUNT = 15;

  // Text fragment detection patterns
  const TEXT_FRAGMENT_PATTERN_FULL = '#:~:text=';
  const TEXT_FRAGMENT_PATTERN_SHORT = '#:~:';

  // Tracking ID validation constants
  const TID_VALIDATION_LENGTH = 36;
  const TID_VALIDATION_HYPHEN_POSITIONS = [8, 13, 18, 23];
  const TID_VALIDATION_HYPHEN_CODE = 45;
  const TID_VALIDATION_CHAR_RANGES = [
    [48, 57],   // '0'-'9'
    [65, 70],   // 'A'-'F'
    [97, 102]   // 'a'-'f'
  ];

  /**
   * Check if running on localhost or private network
   * @returns {boolean} True if localhost
   */
  function isLocalhost() {
    var h = window.location.hostname;
    return h === 'localhost' || h === '::1' ||
           h.endsWith('.local') || h.startsWith('127.') ||
           h.startsWith('10.') || h.startsWith('192.168.');
  }

  /**
   * Extract ALL UTM parameters from URL dynamically
   * @param {string} url - Current page URL
   * @returns {object} Object with all found UTM parameters
   */
  function extractUtmParams(url) {
    var utmParams = {};

    try {
      var urlObj = new URL(url);
      var params = urlObj.searchParams;

      // Dynamically collect ALL parameters starting with 'utm_'
      // This makes the script future-proof for any new UTM parameters
      // Normalize keys to lowercase for consistency (UTM_SOURCE, utm_source, Utm_Source → utm_source)
      params.forEach(function(value, key) {
        var lowerKey = key.toLowerCase();
        if (lowerKey.indexOf('utm_') === 0) {
          utmParams[lowerKey] = value;
        }
      });
    } catch (e) {
      // If URL parsing fails, return empty object
      return {};
    }

    return utmParams;
  }

  // REMOVED: getTimezone() function
  // Timezone is no longer sent from client for privacy reasons
  // Country detection is done server-side using anonymized IP lookup

  /**
    * Get the tracking ID from the script tag's data-key attribute
   * @returns {string|null} Tracking ID or null if not found
   */
  function getDataKeyId() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      if (script.src && script.src.indexOf(CONFIG_SCRIPT_NAME) !== -1) {
        var trackingId = script.getAttribute('data-key');
        if (trackingId) {
          return trackingId;
        }
      }
    }
    return null;
  }

  /**
   * Get allowed domains from script tag's data-domain attribute
   * @returns {string[]|null} Array of allowed domains or null if not specified
   */
  function getAllowedDomains() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      if (script.src && script.src.indexOf(CONFIG_SCRIPT_NAME) !== -1) {
        var domains = script.getAttribute('data-domain');
        if (domains) {
          // Parse comma-separated list, trim whitespace, lowercase
          return domains.split(',').map(function(d) {
            return d.trim().toLowerCase();
          }).filter(function(d) {
            return d.length > 0;
          });
        }
      }
    }
    return null;
  }

  /**
   * Check if current hostname is in the allowed domains list
   * REQUIRED: If no domains configured, blocks everything (security feature)
   * @returns {boolean} True if domain is allowed, false otherwise
   */
  function isDomainAllowed() {
    var allowedDomains = getAllowedDomains();

    // REQUIRED: If no domains configured, block everything
    if (!allowedDomains || allowedDomains.length === 0) {
      return false;
    }

    var currentHost = window.location.hostname.toLowerCase();

    // Check exact match against each allowed domain
    for (var i = 0; i < allowedDomains.length; i++) {
      if (currentHost === allowedDomains[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if current URL pathname is allowed based on include/exclude patterns
   * Precedence: 1) Check include (if set), 2) Check exclude (if set)
   * No patterns = allow all URLs (default)
   * @returns {boolean} True if URL is allowed
   */
  function isUrlPatternAllowed() {
    var scripts = document.getElementsByTagName('script');
    var includePattern = '';
    var excludePattern = '';

    // Find our script tag and get the url pattern attributes
    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      if (script.src && script.src.indexOf(CONFIG_SCRIPT_NAME) !== -1) {
        includePattern = script.getAttribute('data-url-include') || '';
        excludePattern = script.getAttribute('data-url-exclude') || '';
        break;
      }
    }

    var pathname = window.location.pathname;

    // If include pattern is set, URL must match it
    if (includePattern) {
      try {
        var includeRegex = new RegExp('^(' + includePattern + ')');
        if (!includeRegex.test(pathname)) {
          return false; // URL doesn't match include pattern
        }
      } catch (e) {
        console.warn('[AICW] Invalid include pattern:', includePattern);
      }
    }

    // If exclude pattern is set, URL must NOT match it
    if (excludePattern) {
      try {
        var excludeRegex = new RegExp('^(' + excludePattern + ')');
        if (excludeRegex.test(pathname)) {
          return false; // URL matches exclude pattern
        }
      } catch (e) {
        console.warn('[AICW] Invalid exclude pattern:', excludePattern);
      }
    }

    return true; // Default: allow
  }

  /**
   * Sanitize user input to prevent XSS and injection attacks
   * @param {string} str - String to sanitize
   * @param {number} maxLength - Maximum allowed length (default 500)
   * @returns {string} Sanitized string
   */
  function sanitizeString(str, maxLength) {
    if (!str) return '';

    maxLength = maxLength || MAX_STRING_LENGTH;
    var cleaned = String(str);

    // Limit length
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
    }

    // Remove dangerous patterns
    cleaned = cleaned
      .replace(/[<>'"]/g, '')           // HTML/JS special chars
      .replace(/javascript:/gi, '')     // JS protocol
      .replace(/on\w+=/gi, '')          // Event handlers
      .replace(/data:/gi, '')           // Data URLs
      .replace(/vbscript:/gi, '');      // VBScript

    return cleaned.trim();
  }

  /**
   * Validate tracking ID format (simplified)
   * Checks: length, valid characters (using ASCII ranges), hyphen positions
   * Fails immediately at first invalid character
   * @param {string} tid - Tracking ID to validate
   * @returns {boolean} True if valid UUID format
   */
  function isValidTrackingId(tid) {
    // 1. Check length
    if (!tid || tid.length !== TID_VALIDATION_LENGTH) {
      return false;
    }

    // 2. Check each character using ASCII code ranges (fails at first issue)
    for (var i = 0; i < tid.length; i++) {
      var code = tid.charCodeAt(i);

      // Check if this position should have a hyphen
      if (TID_VALIDATION_HYPHEN_POSITIONS.indexOf(i) !== -1) {
        // Must be a hyphen (ASCII 45)
        if (code !== TID_VALIDATION_HYPHEN_CODE) return false;
      } else {
        // Must be a valid hex character - check if code falls in any range
        var isValid = false;
        for (var j = 0; j < TID_VALIDATION_CHAR_RANGES.length; j++) {
          var range = TID_VALIDATION_CHAR_RANGES[j];
          if (code >= range[0] && code <= range[1]) {
            isValid = true;
            break;
          }
        }
        if (!isValid) return false;
      }
    }

    return true;
  }

  /**
   * Extract text fragment from URL using Performance API
   * Text fragments (#:~:text=) are used by AI chatbots to link to specific content
   * 
   * @returns {string|null} Raw URL-encoded text fragment or null if not found
   */
  function extractTextFragment() {

    /*
      SAMPLE LINKS WITH TEXT FRAGMENTS:
      https://aicw.io/#:~:%20Monitor%20&text=your%20website%3F%20Find%20out%20instantly%3A
      https://aicw.io/#:~:Actionable%20Fixes&text=%F0%9F%93%8A%20Graph%20View-,Dive%20deep%20into%20the%20data%20with%20table%20analyze%20mentions%2C%20trends%2C%20order%20of%20appearance%2C%20share%20of%20voice,-and%20relationships%20between
      https://aicw.io/#:~:text=Free%20%26%20open%2Dsource%20%E2%80%A2%20Runs%20on%20your%20computer 
    */

    try {
      // Check if Performance API is available
      if (typeof performance === 'undefined' ||
          typeof performance.getEntriesByType !== 'function') {
        return null;
      }

      // Get full URL from Performance API (before browser strips fragment directive)
      var navEntries = performance.getEntriesByType('navigation');
      if (!navEntries || navEntries.length === 0) {
        return null;
      }

      var fullUrl = navEntries[0].name;
      if (!fullUrl) {
        return null;
      }

      // Check if URL contains text fragment directive
      var fragmentIndex = fullUrl.indexOf(TEXT_FRAGMENT_PATTERN_FULL);
      if (fragmentIndex === -1) {
        fragmentIndex = fullUrl.indexOf(TEXT_FRAGMENT_PATTERN_SHORT);
        if (fragmentIndex === -1) {
          return null;
        }
        else {
          fragmentIndex = fragmentIndex + TEXT_FRAGMENT_PATTERN_SHORT.length;
        }
      }
      else {
        fragmentIndex = fragmentIndex + TEXT_FRAGMENT_PATTERN_FULL.length;
      }

      // Extract everything after '#:~:text=' (S_PATTERN.length)
      var textFragment = fullUrl.substring(fragmentIndex);
      if(textFragment){
        textFragment = decodeURIComponent(textFragment);
      }
      return textFragment || null;

    } catch (e) {
      // Silent fail - Performance API not available or error occurred
      return null;
    }
  }

  function prepareData(trackingId) {
    var currentUrl = window.location.href;
    // extract utm params from current url
    var utmParams = extractUtmParams(currentUrl);

    // Send full referrer as-is - server will normalize it (remove protocol, handle trailing slash)
    var referrer = document.referrer || null;

    // Extract text fragment if present (AI chatbot link tracking)
    var textFragment = extractTextFragment();

    // Build base tracking data with sanitized inputs
    var trackingData = {
      data_key: trackingId,
      page_host: window.location.hostname,
      page_path: sanitizeString(window.location.pathname, MAX_STRING_LENGTH),
      page_title: sanitizeString(document.title, MAX_STRING_LENGTH),
      referrer: sanitizeString(referrer, MAX_STRING_LENGTH),
      text_fragment: sanitizeString(textFragment, MAX_TEXT_FRAGMENT_LENGTH),
      created_at: new Date().toISOString()
      // NOTE: timezone removed - geo-location now detected server-side using anonymized IP
      // NOTE: session_id removed - now generated server-side using Plausible Analytics-style hashing
      // NOTE: device_type removed - now detected server-side from user agent for better accuracy
    };

    // now adding utm_ params to the tracking data (sanitized)
    // This ensures any utm_* parameter is passed to the backend
    for (var key in utmParams) {
      if (utmParams.hasOwnProperty(key)) {
        trackingData[key] = sanitizeString(utmParams[key], UTM_PARAM_MAX_LENGTH);
      }
    }

    return trackingData;
  }

  /**
   * Send tracking data to the backend
   * Uses progressive enhancement: sendBeacon → fetch → XHR
   * All methods use text/plain to avoid CORS preflight requests
   * @param {object} data - Tracking data payload
   */
  function sendData(data) {
    // ========================================================================
    // Security checks
    // ========================================================================

    // Skip tracking on localhost/dev
    if (isLocalhost()) {
      return;
    }

    // NOTE: Bot detection removed - now handled server-side

    // iframe blocking (security - prevent malicious embedding)
    if (window !== window.parent) {
      //console.debug('[AICW] inside iframe');
      return;
    }

    var jsonData = JSON.stringify(data);

    // 1. Best: sendBeacon (most reliable on page unload, no CORS preflight)
    // Must send as Blob with type 'text/plain' to avoid preflight
    if (typeof navigator.sendBeacon !== 'undefined') {
      try {
        var blob = new Blob([jsonData], { type: 'text/plain' });
        var sent = navigator.sendBeacon(CONFIG_ENDPOINT, blob);
        if (sent) {
          return; // Success
        }
        // If sendBeacon returns false (queue full), fall through to fetch
      } catch (e) {
        // sendBeacon failed, fall through to fetch
      }
    }

    // 2. Modern: fetch with keepalive (reliable on page unload, CORS-compatible)
    if (typeof fetch !== 'undefined') {
      fetch(CONFIG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: jsonData,
        keepalive: true,
        credentials: 'omit' // CRITICAL: Prevents CORS issues with wildcard Access-Control-Allow-Origin
      }).catch(function() {}); // Silent fail
      return;
    }

    // 3. Legacy: XMLHttpRequest (IE10+, old browsers)
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', CONFIG_ENDPOINT, true);
      xhr.setRequestHeader('Content-Type', 'text/plain');
      xhr.send(jsonData);
    } catch (e) {} // Silent fail
  }

  /**
   * Initialize tracking
   */
  function init() {
    // Get tracking ID from script tag
    var dataKeyId = getDataKeyId();
    if (!dataKeyId) {
      //console.warn('[AICW] no value in data-key attribute');
      return;
    }

    // Validate tracking ID format
    if (!isValidTrackingId(dataKeyId)) {
      /*
      console.error('[AICW] Invalid data key ID format.' +
        //'Expected ' + TID_VALIDATION.LENGTH + ' character UUID:',
        dataKeyId
      );
      */
      return;
    }

    // Validate domain is in allowed list (REQUIRED - security feature)
    if (!isDomainAllowed()) {
      return;
    }

    // Collect and send tracking data
    var trackingData = prepareData(dataKeyId);
    sendData(trackingData);
  }

  /**
   * Execute init when DOM is ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already loaded
    init();
  }

  // ============================================================================
  // SPA Support - Auto-track route changes
  // ============================================================================

  var currentPath = window.location.pathname;
  var debounceTimer = null;

  /**
   * Debounced tracking function for SPA navigation
   * Includes engagement tracking hooks for Plausible-style metrics
   */
  function trackRouteChange() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(function() {
      if (currentPath !== window.location.pathname) {
        // Send engagement for previous page before navigating (Plausible-style)
        if (window.__aicw_engagement) {
          window.__aicw_engagement.pre();
        }

        currentPath = window.location.pathname;
        init(); // Re-run init to track new pageview

        // Start engagement tracking for new page
        if (window.__aicw_engagement) {
          window.__aicw_engagement.post();
        }
      }
    }, SPA_ROUTE_CHANGE_DEBOUNCE_TIME_MS);
  }

  // Intercept history.pushState (guard against double-patching)
  if (!window.history.pushState.__aicw_patched) {
    var originalPushState = window.history.pushState;
    window.history.pushState = function() {
      originalPushState.apply(this, arguments);
      trackRouteChange();
    };
    window.history.pushState.__aicw_patched = true;
  }

  // Intercept history.replaceState (guard against double-patching)
  if (!window.history.replaceState.__aicw_patched) {
    var originalReplaceState = window.history.replaceState;
    window.history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      trackRouteChange();
    };
    window.history.replaceState.__aicw_patched = true;
  }

  // Handle back/forward button navigation
  window.addEventListener('popstate', function() {
    trackRouteChange();
  });

  // ============================================================================
  // Privacy-First Engagement Tracking (EXACT Plausible Implementation)
  // ============================================================================
  //
  // Source: https://github.com/plausible/analytics/blob/master/tracker/src/engagement.js
  //
  // PRIVACY COMPLIANCE:
  // - NO cookies or local storage (in-memory timer only)
  // - NO persistent identifiers (uses daily-rotating session hash)
  // - NO behavior tracking (just total active time + max scroll depth)
  // - Stateless: resets completely on each page load
  // - Data minimization: only sends if (scrollDepth > previousMax) OR (time >= 3000ms)
  //
  // KEY FEATURES (Plausible-style):
  // 1. Tracks SCROLL DEPTH (not just time)
  // 2. Uses BLUR/FOCUS events (in addition to visibilitychange)
  // 3. Threshold is 3000ms (not 1000ms)
  // 4. Sends when: (scrollDepth > previousMax) OR (engagementTime >= 3000ms)
  // 5. Uses FETCH with keepalive (not sendBeacon)
  //
  // ============================================================================

  (function() {
    // ========================================================================
    // State Variables (exact Plausible naming)
    // ========================================================================
    var listeningOnEngagement = false;

    var currentEngagementIgnored = false;
    var currentEngagementMaxScrollDepth = -1;

    var runningEngagementStart = 0;
    var currentEngagementTime = 0;

    var currentDocumentHeight = 0;
    var maxScrollDepthPx = 0;
    var scrollThrottleTimer = null;

    // ========================================================================
    // Document Height Calculation (handles lazy-loaded content)
    // ========================================================================
    function getDocumentHeight() {
      var body = document.body || {};
      var el = document.documentElement || {};
      return Math.max(
        body.scrollHeight || 0,
        body.offsetHeight || 0,
        body.clientHeight || 0,
        el.scrollHeight || 0,
        el.offsetHeight || 0,
        el.clientHeight || 0
      );
    }

    // ========================================================================
    // Current Scroll Depth (in pixels from top)
    // ========================================================================
    function getCurrentScrollDepthPx() {
      var body = document.body || {};
      var el = document.documentElement || {};
      var viewportHeight = window.innerHeight || el.clientHeight || 0;
      var scrollTop = window.scrollY || el.scrollTop || body.scrollTop || 0;

      // If page fits in viewport, user has seen 100%
      return currentDocumentHeight <= viewportHeight
        ? currentDocumentHeight
        : scrollTop + viewportHeight;
    }

    // ========================================================================
    // Engagement Time Calculation
    // ========================================================================
    function getEngagementTime() {
      if (runningEngagementStart) {
        return currentEngagementTime + (Date.now() - runningEngagementStart);
      } else {
        return currentEngagementTime;
      }
    }

    // ========================================================================
    // Trigger Engagement Event (send to server)
    // ========================================================================
    function triggerEngagement() {
      var engagementTime = getEngagementTime();

      // Plausible condition: send if (scrollDepth > previousMax) OR (time >= 3000ms)
      if (
        !currentEngagementIgnored &&
        (currentEngagementMaxScrollDepth < maxScrollDepthPx || engagementTime >= ENGAGEMENT_THRESHOLD_MS)
      ) {
        currentEngagementMaxScrollDepth = maxScrollDepthPx;

        // Calculate scroll depth percentage (guard against division by zero)
        var scrollDepthPercent = currentDocumentHeight > 0
          ? Math.round((maxScrollDepthPx / currentDocumentHeight) * 100)
          : 0;
        // Clamp to 0-100
        scrollDepthPercent = Math.max(0, Math.min(100, scrollDepthPercent));

        // Validate tracking ID (reuse outer scope function)
        var trackingId = getDataKeyId();
        if (!trackingId || !isValidTrackingId(trackingId)) return;

        // Validate domain is in allowed list (REQUIRED - security feature)
        if (!isDomainAllowed()) return;

        // Build payload
        var payload = {
          data_key: trackingId,
          event_type: 'engagement',
          page_host: window.location.hostname,
          page_path: sanitizeString(window.location.pathname, MAX_STRING_LENGTH),
          engagement_time_ms: engagementTime,
          scroll_depth_percent: scrollDepthPercent,
          created_at: new Date().toISOString()
        };

        // Reset counters (Plausible resets after sending)
        runningEngagementStart = 0;
        currentEngagementTime = 0;

        // Skip localhost/dev
        if (isLocalhost()) {
          return;
        }

        // Send via fetch with keepalive (Plausible approach)
        var jsonData = JSON.stringify(payload);
        if (typeof fetch !== 'undefined') {
          try {
            fetch(CONFIG_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: jsonData,
              keepalive: true,
              credentials: 'omit'
            });
            return;
          } catch (e) {
            // fetch failed, fall through to sendBeacon
          }
        }
        // Fallback: sendBeacon for older browsers
        if (typeof navigator.sendBeacon !== 'undefined') {
          try {
            var blob = new Blob([jsonData], { type: 'text/plain' });
            navigator.sendBeacon(CONFIG_ENDPOINT, blob);
          } catch (e) {
            // Silent fail - engagement is non-critical
          }
        }
      }
    }

    // ========================================================================
    // Visibility Change Handler (Plausible-style)
    // ========================================================================
    function onVisibilityChange() {
      if (
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        runningEngagementStart === 0
      ) {
        // Page visible AND focused AND timer not running -> start timer
        runningEngagementStart = Date.now();
      } else if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        // Page hidden OR lost focus -> accumulate time and send
        currentEngagementTime = getEngagementTime();
        runningEngagementStart = 0;
        triggerEngagement();
      }
    }

    // ========================================================================
    // Register Event Listeners (once only)
    // ========================================================================
    function registerEngagementListener() {
      if (!listeningOnEngagement) {
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('blur', onVisibilityChange);
        window.addEventListener('focus', onVisibilityChange);
        listeningOnEngagement = true;
      }
    }

    // ========================================================================
    // SPA Support: Pre-pageview hook
    // ========================================================================
    function prePageviewTrack() {
      if (listeningOnEngagement) {
        triggerEngagement();
        currentDocumentHeight = getDocumentHeight();
        maxScrollDepthPx = getCurrentScrollDepthPx();
      }
    }

    // ========================================================================
    // SPA Support: Post-pageview hook (called after pageview sent)
    // ========================================================================
    function postPageviewTrack() {
      currentEngagementIgnored = false;
      currentEngagementMaxScrollDepth = -1;
      currentEngagementTime = 0;
      runningEngagementStart = Date.now();
      registerEngagementListener();
    }

    // ========================================================================
    // Initialize Engagement Tracking
    // ========================================================================
    function initEngagement() {
      currentDocumentHeight = getDocumentHeight();
      maxScrollDepthPx = getCurrentScrollDepthPx();

      // Recalculate document height after load (for lazy content)
      window.addEventListener('load', function() {
        currentDocumentHeight = getDocumentHeight();

        // Keep updating for ~3 seconds (lazy-loaded images, etc)
        var count = 0;
        var interval = setInterval(function() {
          currentDocumentHeight = getDocumentHeight();
          if (++count === LAZY_LOAD_CHECK_COUNT) {
            clearInterval(interval);
          }
        }, LAZY_LOAD_CHECK_INTERVAL_MS);
      });

      // Track scroll depth (throttled for performance)
      document.addEventListener('scroll', function() {
        if (scrollThrottleTimer) return;
        scrollThrottleTimer = setTimeout(function() {
          scrollThrottleTimer = null;
          currentDocumentHeight = getDocumentHeight();
          var currentScrollDepthPx = getCurrentScrollDepthPx();

          if (currentScrollDepthPx > maxScrollDepthPx) {
            maxScrollDepthPx = currentScrollDepthPx;
          }
        }, SCROLL_THROTTLE_MS);
      });
    }

    // ========================================================================
    // Export for SPA integration
    // ========================================================================
    window.__aicw_engagement = {
      pre: prePageviewTrack,
      post: postPageviewTrack,
      init: initEngagement
    };

    // Initialize on load
    initEngagement();

    // Auto-start tracking on first pageview
    postPageviewTrack();

  })();

  // ============================================================================
  // Summarize with AI Floating Bar (AddThis-style)
  // ============================================================================
  //
  // FEATURES:
  // - Disabled by default (data-summarize-bar="true" to enable)
  // - Configurable position: left, right, top, bottom
  // - Configurable services: chatgpt, claude, perplexity, gemini, grok
  // - Configurable button size: 32 (default) or 16
  // - Custom prompt support via data-summarize-prompt
  // - Click tracking sent to analytics backend
  // - Responsive: auto-switches to bottom bar on mobile
  //
  // ============================================================================

  (function() {

    // ========================================================================
    // AI Service Registry
    // ========================================================================
    var AI_SERVICES = {
      chatgpt: {
        name: 'ChatGPT',
        url: 'https://chat.openai.com/?q='
      },
      claude: {
        name: 'Claude',
        url: 'https://claude.ai/new?q='
      },
      perplexity: {
        name: 'Perplexity',
        url: 'https://www.perplexity.ai/search/new?q='
      },
      gemini: {
        name: 'Gemini',
        url: 'https://www.google.com/search?udm=50&q='
      },
      grok: {
        name: 'Grok',
        url: 'https://x.com/i/grok?text='
      }
    };

    // ========================================================================
    // Share Services Registry
    // URL templates use {url}, {text}, {title} placeholders
    // ========================================================================
    var SHARE_SERVICES = {
      whatsapp: {
        name: 'WhatsApp',
        urlTemplate: 'https://api.whatsapp.com/send?text={text}%20{url}',
        type: 'redirect'
      },
      x: {
        name: 'X',
        urlTemplate: 'https://twitter.com/intent/tweet?text={text}&url={url}',
        type: 'redirect'
      },
      telegram: {
        name: 'Telegram',
        urlTemplate: 'https://t.me/share/url?url={url}&text={text}',
        type: 'redirect'
      },
      facebook: {
        name: 'Facebook',
        urlTemplate: 'https://www.facebook.com/sharer.php?u={url}',
        type: 'redirect'
      },
      linkedin: {
        name: 'LinkedIn',
        urlTemplate: 'https://www.linkedin.com/sharing/share-offsite/?url={url}',
        type: 'redirect'
      },
      reddit: {
        name: 'Reddit',
        urlTemplate: 'https://reddit.com/submit?url={url}&title={title}',
        type: 'redirect'
      },
      gmail: {
        name: 'Gmail',
        urlTemplate: 'https://mail.google.com/mail/?view=cm&su={title}&body={url}',
        type: 'redirect'
      },
      email: {
        name: 'Email',
        urlTemplate: 'mailto:?subject={title}&body={url}',
        type: 'redirect'
      },
      copy: {
        name: 'Copy Link',
        urlTemplate: null,
        type: 'clipboard'
      }
    };

    // ========================================================================
    // Inline SVG Icons (monochrome, scalable)
    // Based on Bootstrap Icons (MIT) and simplified brand marks
    // ========================================================================
    var AI_ICONS = {
      // ChatGPT/OpenAI - Official knot logo (Bootstrap Icons)
      chatgpt: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z"/></svg>',
      // Claude - Sunburst/starburst logo (Bootstrap Icons)
      claude: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/></svg>',
      // Perplexity - Geometric intersecting lines (Bootstrap Icons)
      perplexity: '<svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 .188a.5.5 0 0 1 .503.5V4.03l3.022-2.92.059-.048a.51.51 0 0 1 .49-.054.5.5 0 0 1 .306.46v3.247h1.117l.1.01a.5.5 0 0 1 .403.49v5.558a.5.5 0 0 1-.503.5H12.38v3.258a.5.5 0 0 1-.312.462.51.51 0 0 1-.55-.11l-3.016-3.018v3.448c0 .275-.225.5-.503.5a.5.5 0 0 1-.503-.5v-3.448l-3.018 3.019a.51.51 0 0 1-.548.11.5.5 0 0 1-.312-.463v-3.258H2.503a.5.5 0 0 1-.503-.5V5.215l.01-.1c.047-.229.25-.4.493-.4H3.62V1.469l.006-.074a.5.5 0 0 1 .302-.387.51.51 0 0 1 .547.102l3.023 2.92V.687c0-.276.225-.5.503-.5M4.626 9.333v3.984l2.87-2.872v-4.01zm3.877 1.113 2.871 2.871V9.333l-2.87-2.897zm3.733-1.668a.5.5 0 0 1 .145.35v1.145h.612V5.715H9.201zm-9.23 1.495h.613V9.13c0-.131.052-.257.145-.35l3.033-3.064h-3.79zm1.62-5.558H6.76L4.626 2.652zm4.613 0h2.134V2.652z"/></svg>',
      // Gemini - 4-pointed star (UXWing, scaled to 16x16)
      gemini: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0c.17 0 .31.115.355.278a9.6 9.6 0 0 0 .494 1.46c.532 1.235 1.261 2.316 2.187 3.242.926.926 2.007 1.655 3.242 2.187a9.63 9.63 0 0 0 1.46.494.367.367 0 0 1 0 .712 9.6 9.6 0 0 0-1.46.494c-1.235.532-2.316 1.261-3.242 2.187-.926.926-1.655 2.007-2.187 3.242a9.63 9.63 0 0 0-.494 1.46.367.367 0 0 1-.711 0 9.6 9.6 0 0 0-.494-1.46c-.532-1.235-1.26-2.316-2.187-3.242-.926-.926-2.007-1.655-3.242-2.187a9.63 9.63 0 0 0-1.46-.494.367.367 0 0 1 0-.712 9.6 9.6 0 0 0 1.46-.494c1.235-.532 2.316-1.26 3.242-2.187.926-.926 1.655-2.007 2.187-3.242a9.63 9.63 0 0 0 .494-1.46A.367.367 0 0 1 8 0z"/></svg>',
      // Grok - Saturn G logo (xAI 2025)
      grok: '<svg viewBox="0 0 512 510" fill="currentColor"><path d="M213.235 306.019l178.976-180.002v.169l51.695-51.763c-.924 1.32-1.86 2.605-2.785 3.89-39.281 54.164-58.46 80.649-43.07 146.922l-.09-.101c10.61 45.11-.744 95.137-37.398 131.836-46.216 46.306-120.167 56.611-181.063 14.928l42.462-19.675c38.863 15.278 81.392 8.57 111.947-22.03 30.566-30.6 37.432-75.159 22.065-112.252-2.92-7.025-11.67-8.795-17.792-4.263l-124.947 92.341zm-25.786 22.437l-.033.034L68.094 435.217c7.565-10.429 16.957-20.294 26.327-30.149 26.428-27.803 52.653-55.359 36.654-94.302-21.422-52.112-8.952-113.177 30.724-152.898 41.243-41.254 101.98-51.661 152.706-30.758 11.23 4.172 21.016 10.114 28.638 15.639l-42.359 19.584c-39.44-16.563-84.629-5.299-112.207 22.313-37.298 37.308-44.84 102.003-1.128 143.81z"/></svg>'
    };

    // ========================================================================
    // Share Icons (monochrome, scalable - matches AI_ICONS style)
    // ========================================================================
    var SHARE_ICONS = {
      // WhatsApp - Phone in chat bubble
      whatsapp: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>',
      // X - Twitter/X logo (same as grok)
      x: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"/></svg>',
      // Telegram - Paper plane
      telegram: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.168.486-4.666 2.01-.567.225-.595.442c-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294q.39.01.868-.32 3.269-2.206 3.374-2.23c.05-.012.12-.026.166.016s.042.12.037.141c-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8 8 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629q.14.092.27.187c.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.4 1.4 0 0 0-.013-.315.34.34 0 0 0-.114-.217.53.53 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09"/></svg>',
      // Facebook - F logo
      facebook: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/></svg>',
      // LinkedIn - in logo
      linkedin: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z"/></svg>',
      // Reddit - Alien head
      reddit: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.167 8a.83.83 0 0 0-.83.83c0 .459.372.84.83.831a.831.831 0 0 0 0-1.661m1.843 3.647c.315 0 1.403-.038 1.976-.611a.23.23 0 0 0 0-.306.213.213 0 0 0-.306 0c-.353.363-1.126.487-1.67.487-.545 0-1.308-.124-1.671-.487a.213.213 0 0 0-.306 0 .213.213 0 0 0 0 .306c.564.563 1.652.61 1.977.61zm.992-2.807c0 .458.373.83.831.83s.83-.381.83-.83a.831.831 0 0 0-1.66 0z"/><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.828-1.165c-.315 0-.602.124-.812.325-.801-.573-1.9-.945-3.121-.993l.534-2.501 1.738.372a.83.83 0 1 0 .83-.869.83.83 0 0 0-.744.468l-1.938-.41a.2.2 0 0 0-.153.028.2.2 0 0 0-.086.134l-.592 2.788c-1.24.038-2.358.41-3.17.992-.21-.2-.496-.324-.81-.324a1.163 1.163 0 0 0-.478 2.224q-.03.17-.029.353c0 1.795 2.091 3.256 4.669 3.256s4.668-1.451 4.668-3.256c0-.114-.01-.238-.029-.353.401-.181.688-.592.688-1.069 0-.65-.525-1.165-1.165-1.165"/></svg>',
      // Gmail - Google G logo
      gmail: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M15.545 6.558a9.4 9.4 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0a7.7 7.7 0 0 1 5.352 2.082l-2.284 2.284A4.35 4.35 0 0 0 8 3.166c-2.087 0-3.86 1.408-4.492 3.304a4.8 4.8 0 0 0 0 3.063h.003c.635 1.893 2.405 3.301 4.492 3.301 1.078 0 2.004-.276 2.722-.764h-.003a3.7 3.7 0 0 0 1.599-2.431H8v-3.08z"/></svg>',
      // Email - Envelope (generic mailto)
      email: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1zm13 2.383-4.708 2.825L15 11.105zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741M1 11.105l4.708-2.897L1 5.383z"/></svg>',
      // Copy - Clipboard/documents
      copy: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"/></svg>',
      // Checkmark - For copy success feedback
      checkmark: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0"/></svg>'
    };

    // ========================================================================
    // Gradient Color Helpers
    // ========================================================================

    /**
     * Parse hex color to RGB components
     * Supports #RGB and #RRGGBB formats
     * @param {string} hex - Hex color string
     * @returns {string|null} RGB values as "r,g,b" or null if invalid
     */
    function hexToRgb(hex) {
      if (!hex || typeof hex !== 'string') return null;
      hex = hex.replace('#', '');
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      if (hex.length !== 6) return null;
      var r = parseInt(hex.substring(0, 2), 16);
      var g = parseInt(hex.substring(2, 4), 16);
      var b = parseInt(hex.substring(4, 6), 16);
      if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
      return r + ',' + g + ',' + b;
    }

    /**
     * Build gradient CSS from text color
     * Returns neutral gray gradient if no textColor provided
     * @param {string} textColor - Optional hex color
     * @returns {string} CSS linear-gradient value
     */
    function buildGradient(textColor) {
      var rgb = textColor ? hexToRgb(textColor) : null;
      var base = rgb || '0,0,0';
      return 'linear-gradient(180deg,rgba(' + base + ',0.08) 0%,rgba(' + base + ',0.20) 50%,rgba(' + base + ',0.08) 100%)';
    }

    // ========================================================================
    // Configuration Defaults
    // ========================================================================
    var SUMMARIZE_DEFAULTS = {
      enabled: true,               // Enabled by default
      position: 'right',           // Default to right sidebar
      services: 'gemini,chatgpt,perplexity,claude,grok',  // Default: all 5 AI services
      prompt: 'Summarize this page:',
      mobilePosition: 'bottom',    // Mobile position (top/bottom)
      bgColor: '',                 // Custom background color (empty = light theme default)
      textColor: ''                // Custom text color (empty = light theme default)
    };

    var SHARE_DEFAULTS = {
      enabled: true,               // Enabled by default
      services: 'whatsapp,telegram,x,gmail,linkedin' // Default: 5 share services
    };

    // ========================================================================
    // CSS Styles (generated dynamically for gradient color)
    // Trigger button + Popup design with glassmorphism
    // ========================================================================
    function getSummarizeCss(gradient) {
      return '\
      /* Trigger Bar - Glassmorphism */\
      #aicw-summarize-bar{position:fixed;z-index:2147483646;display:flex;align-items:center;background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.5);border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.1);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;transition:opacity 0.2s,box-shadow 0.2s;overflow:hidden;cursor:pointer}\
      #aicw-summarize-bar:hover{box-shadow:0 4px 24px rgba(0,0,0,0.12)}\
      .aicw-trigger{display:flex;align-items:center;gap:8px;padding:0;background:none;border:none;cursor:pointer;font-family:inherit}\
      .aicw-trigger-text{font-size:14px;font-weight:500;color:#374151;white-space:nowrap}\
      .aicw-close{display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:rgba(0,0,0,0.05);border:none;border-radius:4px;color:#6b7280;font-size:16px;cursor:pointer;transition:all 0.15s}\
      .aicw-close:hover{background:rgba(0,0,0,0.1);color:#374151}\
      /* Horizontal layout (top/bottom) */\
      #aicw-summarize-bar.aicw-top,#aicw-summarize-bar.aicw-bottom{flex-direction:row;gap:10px;padding:10px 14px}\
      #aicw-summarize-bar.aicw-top .aicw-trigger,#aicw-summarize-bar.aicw-bottom .aicw-trigger{flex-direction:row}\
      #aicw-summarize-bar.aicw-top::before,#aicw-summarize-bar.aicw-bottom::before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:3px;background:' + gradient + ';border-radius:3px 0 0 3px}\
      .aicw-top{top:12px;left:50%;transform:translateX(-50%)}\
      .aicw-bottom{bottom:12px;left:50%;transform:translateX(-50%)}\
      /* Vertical layout (left/right) */\
      #aicw-summarize-bar.aicw-left,#aicw-summarize-bar.aicw-right{flex-direction:column;gap:8px;padding:12px 10px}\
      #aicw-summarize-bar.aicw-left .aicw-trigger,#aicw-summarize-bar.aicw-right .aicw-trigger{flex-direction:column}\
      #aicw-summarize-bar.aicw-left .aicw-trigger-text,#aicw-summarize-bar.aicw-right .aicw-trigger-text{writing-mode:vertical-rl;text-orientation:mixed}\
      #aicw-summarize-bar.aicw-left .aicw-trigger-text{transform:rotate(180deg)}\
      #aicw-summarize-bar.aicw-right::before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:3px;background:' + gradient + ';border-radius:3px 0 0 3px}\
      #aicw-summarize-bar.aicw-left::before{content:\"\";position:absolute;right:0;top:0;bottom:0;width:3px;background:' + gradient + ';border-radius:0 3px 3px 0}\
      .aicw-left{left:12px;top:50%;transform:translateY(-50%)}\
      .aicw-right{right:12px;top:50%;transform:translateY(-50%)}\
      /* Popup - Glassmorphism */\
      #aicw-summarize-popup{position:fixed;z-index:2147483647;background:rgba(255,255,255,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.5);border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);padding:8px;opacity:0;pointer-events:none;transition:opacity 0.2s;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;min-width:180px;max-width:280px}\
      #aicw-summarize-popup::before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:3px;background:' + gradient + ';border-radius:3px 0 0 3px}\
      #aicw-summarize-popup.aicw-visible{opacity:1;pointer-events:auto}\
      .aicw-popup-title{padding:8px 12px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}\
      .aicw-popup-item{display:flex;align-items:center;gap:12px;padding:10px 14px;color:#1f2937;text-decoration:none;border-radius:8px;transition:background 0.15s;font-size:14px}\
      .aicw-popup-item:hover{background:rgba(0,0,0,0.05)}\
      .aicw-popup-item svg{width:20px;height:20px;flex-shrink:0}\
      .aicw-popup-item span{flex:1}\
      /* Horizontal icons row (compact layout) */\
      .aicw-popup-icons-row{display:flex;gap:8px;padding:8px 12px;flex-wrap:wrap}\
      .aicw-popup-icon-btn{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:rgba(0,0,0,0.04);color:#1f2937;text-decoration:none;transition:background 0.15s,transform 0.1s}\
      .aicw-popup-icon-btn:hover{background:rgba(0,0,0,0.08);transform:scale(1.05)}\
      .aicw-popup-icon-btn svg{width:22px;height:22px}\
      .aicw-powered-by{display:block;text-align:right;padding:8px 12px 4px;font-size:10px;color:rgba(0,0,0,0.35)}\
      .aicw-powered-by a{color:rgba(0,0,0,0.35);text-decoration:none}\
      .aicw-powered-by a:hover{color:rgba(0,0,0,0.5)}\
      /* Section separator */\
      .aicw-popup-separator{height:1px;background:rgba(0,0,0,0.08);margin:8px 0}\
      /* Popup close button */\
      .aicw-popup-close{position:absolute;top:8px;right:8px;display:flex;align-items:center;justify-content:center;width:20px;height:20px;background:rgba(0,0,0,0.05);border:none;border-radius:4px;color:#9ca3af;font-size:14px;cursor:pointer;transition:all 0.15s;z-index:1}\
      .aicw-popup-close:hover{background:rgba(0,0,0,0.1);color:#374151}\
      /* Meta description preview */\
      .aicw-popup-description-wrapper{padding:12px 14px;margin:-8px -8px 0 -8px;background:rgba(0,0,0,0.03);border-radius:12px 12px 0 0;border-bottom:1px solid rgba(0,0,0,0.06)}\
      .aicw-popup-description-label{display:block;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}\
      .aicw-popup-description{font-size:13px;line-height:1.5;color:#374151;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical}\
      /* Mobile: horizontal bar + bottom sheet popup */\
      @media(max-width:767px){#aicw-summarize-bar{flex-direction:row!important;gap:10px!important;padding:10px 14px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important}}\
      @media(max-width:767px){#aicw-summarize-bar .aicw-trigger{flex-direction:row!important}}\
      @media(max-width:767px){#aicw-summarize-bar .aicw-trigger-text{writing-mode:horizontal-tb!important;transform:none!important}}\
      @media(max-width:767px){#aicw-summarize-bar::before{left:0!important;right:auto!important;border-radius:3px 0 0 3px!important}}\
      @media(max-width:767px){#aicw-summarize-bar.aicw-mobile-top{top:12px!important;bottom:auto!important}}\
      @media(max-width:767px){#aicw-summarize-bar.aicw-mobile-bottom{bottom:12px!important;top:auto!important}}\
      @media(max-width:767px){#aicw-summarize-popup{left:8px!important;right:8px!important;bottom:0!important;top:auto!important;border-radius:16px 16px 0 0;padding:16px;transform:translateY(100%);transition:transform 0.3s,opacity 0.2s}}\
      @media(max-width:767px){#aicw-summarize-popup.aicw-visible{transform:translateY(0)}}\
      /* Mobile: prevent icon row wrapping */\
      @media(max-width:767px){.aicw-popup-icons-row{gap:6px;padding:8px 10px}}\
      @media(max-width:767px){.aicw-popup-icon-btn{width:36px;height:36px}}\
    ';
    }

    // ========================================================================
    // Get Summarize Bar Configuration from Script Tag
    // ========================================================================
    function getSummarizeConfig() {
      var scripts = document.getElementsByTagName('script');
      var config = {};

      for (var i = 0; i < scripts.length; i++) {
        var script = scripts[i];
        if (script.src && script.src.indexOf(CONFIG_SCRIPT_NAME) !== -1) {
          // Check if summarize bar is disabled (enabled by default)
          var enabled = script.getAttribute('data-summarize-bar');
          // Enabled by default - only disable if explicitly "false" or "0"
          config.enabled = enabled !== 'false' && enabled !== '0';

          // Get other config options
          config.position = script.getAttribute('data-summarize-position') || SUMMARIZE_DEFAULTS.position;
          config.services = script.getAttribute('data-summarize-services') || SUMMARIZE_DEFAULTS.services;
          config.prompt = script.getAttribute('data-summarize-prompt') || SUMMARIZE_DEFAULTS.prompt;
          // Mobile position (backward compat: also check data-summarize-mobile)
          config.mobilePosition = script.getAttribute('data-summarize-mobile-position')
            || script.getAttribute('data-summarize-mobile')
            || SUMMARIZE_DEFAULTS.mobilePosition;
          // Custom colors (empty string means use default light theme)
          config.bgColor = script.getAttribute('data-summarize-bg-color') || '';
          config.textColor = script.getAttribute('data-summarize-text-color') || '';

          // Share configuration
          var shareEnabled = script.getAttribute('data-share-bar');
          // Share enabled by default - only disable if explicitly "false" or "0"
          config.shareEnabled = shareEnabled !== 'false' && shareEnabled !== '0';
          config.shareServices = script.getAttribute('data-share-services') || SHARE_DEFAULTS.services;

          // URL pattern filtering (include = show only on, exclude = hide on)
          config.urlInclude = script.getAttribute('data-url-include') || '';
          config.urlExclude = script.getAttribute('data-url-exclude') || '';

          break;
        }
      }

      return config;
    }

    // ========================================================================
    // Parse Services List
    // ========================================================================
    function parseServices(servicesStr) {
      if (!servicesStr || servicesStr === 'all') {
        return Object.keys(AI_SERVICES);
      }
      return servicesStr.toLowerCase().split(',').map(function(s) {
        return s.trim();
      }).filter(function(s) {
        return AI_SERVICES[s];
      });
    }

    // ========================================================================
    // Build AI Service URL with Prompt
    // ========================================================================
    function buildServiceUrl(serviceKey, prompt) {
      var service = AI_SERVICES[serviceKey];
      if (!service) return null;

      // Include page title for context - helps AI understand page content
      var title = document.title || '';
      var url = window.location.href;
      var fullPrompt = prompt + ' "' + title + '" ' + url;
      return service.url + encodeURIComponent(fullPrompt);
    }

    // ========================================================================
    // Build Share URL with Template Substitution
    // ========================================================================
    /**
     * Build share URL by replacing {url}, {text}, {title} placeholders
     * @param {string} serviceKey - Share service key
     * @returns {string|null} Complete share URL or null for clipboard action
     */
    function buildShareUrl(serviceKey) {
      var service = SHARE_SERVICES[serviceKey];
      if (!service || service.type === 'clipboard') return null;

      // Add UTM parameters to track share source
      var baseUrl = window.location.href;
      var separator = baseUrl.indexOf('?') >= 0 ? '&' : '?';
      var urlWithUtm = baseUrl + separator + 'utm_source=aicw_share&utm_medium=' + serviceKey;

      var url = encodeURIComponent(urlWithUtm);
      var title = encodeURIComponent(document.title || '');

      return service.urlTemplate
        .replace('{url}', url)
        .replace('{text}', title)
        .replace('{title}', title);
    }

    // ========================================================================
    // Parse Share Services List (order-preserving)
    // ========================================================================
    function parseShareServices(servicesStr) {
      if (!servicesStr || servicesStr === 'all') {
        return Object.keys(SHARE_SERVICES);
      }
      return servicesStr.toLowerCase().split(',').map(function(s) {
        return s.trim();
      }).filter(function(s) {
        return SHARE_SERVICES[s];
      });
    }

    // ========================================================================
    // Track Summarize Click
    // ========================================================================
    function trackSummarizeClick(serviceKey) {
      var trackingId = getDataKeyId();
      if (!trackingId || !isValidTrackingId(trackingId)) return;

      var payload = {
        data_key: trackingId,
        event_type: 'summarize_click',
        page_host: window.location.hostname,
        page_path: sanitizeString(window.location.pathname, MAX_STRING_LENGTH),
        ai_service: serviceKey,
        created_at: new Date().toISOString()
      };

      // Skip localhost
      if (isLocalhost()) return;

      // Send via fetch or sendBeacon
      var jsonData = JSON.stringify(payload);
      if (typeof fetch !== 'undefined') {
        try {
          fetch(CONFIG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: jsonData,
            keepalive: true,
            credentials: 'omit'
          });
          return;
        } catch (e) {}
      }
      if (typeof navigator.sendBeacon !== 'undefined') {
        try {
          var blob = new Blob([jsonData], { type: 'text/plain' });
          navigator.sendBeacon(CONFIG_ENDPOINT, blob);
        } catch (e) {}
      }
    }

    // ========================================================================
    // Track Summarize Popup Opened
    // ========================================================================
    function trackSummarizeOpened() {
      var trackingId = getDataKeyId();
      if (!trackingId || !isValidTrackingId(trackingId)) return;

      var payload = {
        data_key: trackingId,
        event_type: 'summarize_opened',
        page_host: window.location.hostname,
        page_path: sanitizeString(window.location.pathname, MAX_STRING_LENGTH),
        created_at: new Date().toISOString()
      };

      // Skip localhost
      if (isLocalhost()) return;

      // Send via fetch or sendBeacon
      var jsonData = JSON.stringify(payload);
      if (typeof fetch !== 'undefined') {
        try {
          fetch(CONFIG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: jsonData,
            keepalive: true,
            credentials: 'omit'
          });
          return;
        } catch (e) {}
      }
      if (typeof navigator.sendBeacon !== 'undefined') {
        try {
          var blob = new Blob([jsonData], { type: 'text/plain' });
          navigator.sendBeacon(CONFIG_ENDPOINT, blob);
        } catch (e) {}
      }
    }

    // ========================================================================
    // Track Share Click
    // ========================================================================
    function trackShareClick(serviceKey) {
      var trackingId = getDataKeyId();
      if (!trackingId || !isValidTrackingId(trackingId)) return;

      var payload = {
        data_key: trackingId,
        event_type: 'share_click',
        page_host: window.location.hostname,
        page_path: sanitizeString(window.location.pathname, MAX_STRING_LENGTH),
        ai_service: serviceKey,  // Reuse field for service name
        created_at: new Date().toISOString()
      };

      // Skip localhost
      if (isLocalhost()) return;

      // Send via fetch or sendBeacon
      var jsonData = JSON.stringify(payload);
      if (typeof fetch !== 'undefined') {
        try {
          fetch(CONFIG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: jsonData,
            keepalive: true,
            credentials: 'omit'
          });
          return;
        } catch (e) {}
      }
      if (typeof navigator.sendBeacon !== 'undefined') {
        try {
          var blob = new Blob([jsonData], { type: 'text/plain' });
          navigator.sendBeacon(CONFIG_ENDPOINT, blob);
        } catch (e) {}
      }
    }

    // ========================================================================
    // Handle Copy Link (Clipboard API with fallback)
    // ========================================================================
    /**
     * Copy URL to clipboard and show success feedback
     * @param {HTMLElement} copyBtn - The copy button element
     */
    function handleCopyLink(copyBtn) {
      var url = window.location.href;

      // Modern clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
          showCopySuccess(copyBtn);
          trackShareClick('copy');
        }).catch(function() {
          fallbackCopy(url, copyBtn);
        });
      } else {
        fallbackCopy(url, copyBtn);
      }
    }

    /**
     * Fallback copy using execCommand (for older browsers)
     */
    function fallbackCopy(text, copyBtn) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
        showCopySuccess(copyBtn);
        trackShareClick('copy');
      } catch (e) {
        // Silent fail
      }

      document.body.removeChild(textarea);
    }

    /**
     * Show copy success feedback (change icon and tooltip temporarily)
     */
    function showCopySuccess(copyBtn) {
      if (!copyBtn) return;

      var svgEl = copyBtn.querySelector('svg');
      if (!svgEl) return;

      var originalIcon = svgEl.outerHTML;
      var originalTitle = copyBtn.title;

      // Change to checkmark icon and update tooltip
      svgEl.outerHTML = SHARE_ICONS.checkmark;
      copyBtn.title = 'Copied!';

      // Restore after 1.5 seconds
      setTimeout(function() {
        var newSvg = copyBtn.querySelector('svg');
        if (newSvg) newSvg.outerHTML = originalIcon;
        copyBtn.title = originalTitle;
      }, 1500);
    }

    // ========================================================================
    // Get Meta Description from Page
    // ========================================================================
    /**
     * Extract meta description from page
     * Checks: meta[name="description"] → meta[property="og:description"]
     * @returns {string|null} Description text or null if not found/empty
     */
    function getMetaDescription() {
      try {
        // Try standard meta description first
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && metaDesc.content) {
          var content = metaDesc.content.trim();
          if (content.length > 0) return content;
        }

        // Fallback to Open Graph description
        var ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc && ogDesc.content) {
          var ogContent = ogDesc.content.trim();
          if (ogContent.length > 0) return ogContent;
        }

        return null;
      } catch (e) {
        return null;
      }
    }

    // ========================================================================
    // Popup State
    // ========================================================================
    var popupState = {
      isOpen: false,
      config: null,
      services: []
    };

    // ========================================================================
    // Create Popup DOM
    // ========================================================================
    function createPopup(config, services, shareServices) {
      // Don't create if already exists
      if (document.getElementById('aicw-summarize-popup')) return;

      var popup = document.createElement('div');
      popup.id = 'aicw-summarize-popup';
      popup.setAttribute('role', 'menu');
      popup.setAttribute('aria-label', 'Services');

      // Close button
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'aicw-popup-close';
      closeBtn.title = 'Close';
      closeBtn.setAttribute('aria-label', 'Close popup');
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        closePopup();
      });
      popup.appendChild(closeBtn);

      // Meta description preview (only if non-empty)
      var metaDescription = getMetaDescription();
      if (metaDescription && metaDescription.length > 0) {
        // Wrapper holds label + description text
        var descWrapper = document.createElement('div');
        descWrapper.className = 'aicw-popup-description-wrapper';

        var descLabel = document.createElement('div');
        descLabel.className = 'aicw-popup-description-label';
        descLabel.textContent = 'Page summary';
        descWrapper.appendChild(descLabel);

        // Description text in separate element (CSS line-clamp requires pure text container)
        var descText = document.createElement('div');
        descText.className = 'aicw-popup-description';
        descText.textContent = metaDescription;
        descWrapper.appendChild(descText);

        popup.appendChild(descWrapper);
      }

      // Summarize section (if enabled and has services)
      if (config.enabled && services && services.length > 0) {
        // Title
        var title = document.createElement('div');
        title.className = 'aicw-popup-title';
        title.textContent = 'Summarize with';
        popup.appendChild(title);

        // AI Service icons row (horizontal layout)
        var summarizeRow = document.createElement('div');
        summarizeRow.className = 'aicw-popup-icons-row';

        services.forEach(function(serviceKey) {
          var service = AI_SERVICES[serviceKey];
          var icon = AI_ICONS[serviceKey];
          if (!service || !icon) return;

          var url = buildServiceUrl(serviceKey, config.prompt);
          if (!url) return;

          var item = document.createElement('a');
          item.href = url;
          item.target = '_blank';
          item.rel = 'noopener noreferrer';
          item.className = 'aicw-popup-icon-btn';
          item.title = service.name;
          item.setAttribute('role', 'menuitem');
          item.setAttribute('aria-label', 'Summarize with ' + service.name);
          item.innerHTML = icon;

          // Track click and close popup
          item.addEventListener('click', function() {
            trackSummarizeClick(serviceKey);
            closePopup();
          });

          summarizeRow.appendChild(item);
        });

        popup.appendChild(summarizeRow);
      }

      // Share section (if enabled and has services)
      if (config.shareEnabled && shareServices && shareServices.length > 0) {
        // Add separator if summarize section exists
        if (config.enabled && services && services.length > 0) {
          var separator = document.createElement('div');
          separator.className = 'aicw-popup-separator';
          popup.appendChild(separator);
        }

        // Share title
        var shareTitle = document.createElement('div');
        shareTitle.className = 'aicw-popup-title';
        shareTitle.textContent = 'Share';
        popup.appendChild(shareTitle);

        // Share service icons row (horizontal layout)
        var shareRow = document.createElement('div');
        shareRow.className = 'aicw-popup-icons-row';

        shareServices.forEach(function(serviceKey) {
          var service = SHARE_SERVICES[serviceKey];
          var icon = SHARE_ICONS[serviceKey];
          if (!service || !icon) return;

          var item = document.createElement('a');
          item.className = 'aicw-popup-icon-btn';
          item.title = service.name;
          item.setAttribute('role', 'menuitem');
          item.setAttribute('aria-label', 'Share via ' + service.name);
          item.innerHTML = icon;

          if (service.type === 'clipboard') {
            // Copy link - button behavior, not link
            item.href = '#';
            item.addEventListener('click', function(e) {
              e.preventDefault();
              handleCopyLink(item);
            });
          } else {
            // Regular share link
            var url = buildShareUrl(serviceKey);
            item.href = url;
            item.target = '_blank';
            item.rel = 'noopener noreferrer';
            item.addEventListener('click', function() {
              trackShareClick(serviceKey);
              closePopup();
            });
          }

          shareRow.appendChild(item);
        });

        popup.appendChild(shareRow);
      }

      // Powered by text with link only on AICW
      var poweredBy = document.createElement('span');
      poweredBy.className = 'aicw-powered-by';
      poweredBy.appendChild(document.createTextNode('powered by '));
      var poweredByLink = document.createElement('a');
      poweredByLink.href = 'https://aicw.io';
      poweredByLink.target = '_blank';
      poweredByLink.rel = 'noopener noreferrer';
      poweredByLink.textContent = 'AICW';
      poweredBy.appendChild(poweredByLink);
      popup.appendChild(poweredBy);

      document.body.appendChild(popup);

      // Store state
      popupState.config = config;
      popupState.services = services;
      popupState.shareServices = shareServices;
    }

    // ========================================================================
    // Position Popup Relative to Trigger
    // ========================================================================
    function positionPopup() {
      var popup = document.getElementById('aicw-summarize-popup');
      var bar = document.getElementById('aicw-summarize-bar');
      if (!popup || !bar) return;

      // On mobile, popup is positioned via CSS (bottom sheet)
      if (window.innerWidth <= 767) {
        popup.style.left = '';
        popup.style.right = '';
        popup.style.top = '';
        popup.style.bottom = '';
        return;
      }

      var barRect = bar.getBoundingClientRect();
      var position = popupState.config ? popupState.config.position : 'right';

      // Reset positioning
      popup.style.left = '';
      popup.style.right = '';
      popup.style.top = '';
      popup.style.bottom = '';

      // Position based on bar position
      switch (position) {
        case 'left':
          popup.style.left = (barRect.right + 12) + 'px';
          popup.style.top = barRect.top + 'px';
          break;
        case 'right':
          popup.style.right = (window.innerWidth - barRect.right) + 'px';
          popup.style.top = barRect.top + 'px';
          break;
        case 'top':
          popup.style.top = (barRect.bottom + 12) + 'px';
          popup.style.left = barRect.left + 'px';
          break;
        case 'bottom':
          popup.style.bottom = (window.innerHeight - barRect.top + 12) + 'px';
          popup.style.left = barRect.left + 'px';
          break;
      }
    }

    // ========================================================================
    // Open Popup
    // ========================================================================
    function openPopup() {
      var popup = document.getElementById('aicw-summarize-popup');
      var bar = document.getElementById('aicw-summarize-bar');
      if (!popup) return;

      // Track popup open event (count every open)
      trackSummarizeOpened();

      // FIX: Position popup BEFORE hiding bar (getBoundingClientRect needs visible element)
      positionPopup();

      // Hide the trigger bar AFTER positioning
      if (bar) {
        bar.style.display = 'none';
      }

      popup.classList.add('aicw-visible');
      popupState.isOpen = true;

      // Add click outside listener
      setTimeout(function() {
        document.addEventListener('click', handleClickOutside);
      }, 10);
    }

    // ========================================================================
    // Close Popup
    // ========================================================================
    function closePopup() {
      var popup = document.getElementById('aicw-summarize-popup');
      var bar = document.getElementById('aicw-summarize-bar');
      if (!popup) return;

      popup.classList.remove('aicw-visible');
      popupState.isOpen = false;

      // Show the trigger bar again
      if (bar) {
        bar.style.display = '';
      }

      // Remove click outside listener
      document.removeEventListener('click', handleClickOutside);
    }

    // ========================================================================
    // Toggle Popup
    // ========================================================================
    function togglePopup() {
      if (popupState.isOpen) {
        closePopup();
      } else {
        openPopup();
      }
    }

    // ========================================================================
    // Handle Click Outside
    // ========================================================================
    function handleClickOutside(e) {
      var popup = document.getElementById('aicw-summarize-popup');
      var bar = document.getElementById('aicw-summarize-bar');

      if (!popup || !bar) return;

      // If click is outside both popup and bar, close popup
      if (!popup.contains(e.target) && !bar.contains(e.target)) {
        closePopup();
      }
    }

    // ========================================================================
    // Inject CSS Styles
    // ========================================================================
    function injectStyles(config) {
      if (document.getElementById('aicw-summarize-styles')) return;

      var gradient = buildGradient(config.textColor);
      var style = document.createElement('style');
      style.id = 'aicw-summarize-styles';
      style.textContent = getSummarizeCss(gradient);
      document.head.appendChild(style);
    }

    // ========================================================================
    // Create Floating Bar DOM (Trigger Button Design)
    // Clicking the trigger opens a popup with services
    // ========================================================================
    function createSummarizeBar(config, services, shareServices) {
      // Don't create if already exists
      if (document.getElementById('aicw-summarize-bar')) return;

      // Determine trigger text based on enabled features
      var hasSummarize = services && services.length > 0;
      var hasShare = shareServices && shareServices.length > 0;
      var buttonText = 'Summarize';  // Default
      var ariaLabel = 'Summarize this page';
      if (!hasSummarize && hasShare) {
        buttonText = 'Share';
        ariaLabel = 'Share this page';
      } else if (hasSummarize && hasShare) {
        buttonText = 'Summarize';  // Primary action when both enabled
        ariaLabel = 'Summarize or share this page';
      }

      // Create container
      var bar = document.createElement('div');
      bar.id = 'aicw-summarize-bar';
      bar.className = 'aicw-' + config.position;
      // Add mobile position class
      bar.className += ' aicw-mobile-' + config.mobilePosition;
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', ariaLabel);
      bar.setAttribute('aria-haspopup', 'true');
      bar.setAttribute('aria-expanded', 'false');

      // Apply custom colors if provided
      if (config.bgColor) {
        bar.style.background = config.bgColor;
      }

      // Create trigger button
      var trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'aicw-trigger';

      var triggerText = document.createElement('span');
      triggerText.className = 'aicw-trigger-text';
      triggerText.textContent = buttonText;
      if (config.textColor) {
        triggerText.style.color = config.textColor;
      }
      trigger.appendChild(triggerText);

      // Click trigger to toggle popup
      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        togglePopup();
        bar.setAttribute('aria-expanded', popupState.isOpen ? 'true' : 'false');
      });

      bar.appendChild(trigger);

      // Add close button
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'aicw-close';
      closeBtn.title = 'Hide';
      closeBtn.setAttribute('aria-label', 'Close bar');
      closeBtn.innerHTML = '&times;';
      if (config.textColor) {
        closeBtn.style.color = config.textColor;
      }
      closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        // Hide bar and popup (session only - reappears on page reload)
        bar.style.display = 'none';
        var popup = document.getElementById('aicw-summarize-popup');
        if (popup) popup.style.display = 'none';
      });
      bar.appendChild(closeBtn);

      document.body.appendChild(bar);
    }

    // ========================================================================
    // Initialize Summarize Bar
    // ========================================================================
    function initSummarizeBar() {
      var config = getSummarizeConfig();

      // Skip localhost
      if (isLocalhost()) return;

      // Skip iframes
      if (window !== window.parent) return;

      // Validate domain is in allowed list (REQUIRED - security feature)
      if (!isDomainAllowed()) return;

      // Check URL pattern filter (if specified)
      if (!isUrlPatternAllowed()) return;

      // Parse services (summarize and share)
      var services = config.enabled ? parseServices(config.services) : [];
      var shareServices = config.shareEnabled ? parseShareServices(config.shareServices) : [];

      // Only proceed if at least one feature is enabled with services
      if (services.length === 0 && shareServices.length === 0) return;

      // Inject styles and create bar + popup
      injectStyles(config);
      createSummarizeBar(config, services, shareServices);
      createPopup(config, services, shareServices);
    }

    // ========================================================================
    // Initialize when DOM is ready
    // ========================================================================
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSummarizeBar);
    } else {
      initSummarizeBar();
    }

  })();

})();
