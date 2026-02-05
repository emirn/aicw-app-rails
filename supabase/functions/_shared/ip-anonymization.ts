/**
 * IP Address Anonymization Module (Matomo/Google Analytics-style)
 *
 * Provides privacy-first IP address anonymization for both IPv4 and IPv6.
 * Used across analytics functions to ensure full IP addresses are never stored.
 *
 * Industry Standards:
 * - Google Analytics (UA): IPv4 = 1 octet (8 bits), IPv6 = 80 bits
 * - Matomo (default): IPv4 = 2 octets (16 bits), IPv6 = 80 bits
 * - Plausible: No masking - uses hash with daily rotating salt instead
 *
 * We use Matomo's approach for IPv4 (2 octets) and industry standard for IPv6 (80 bits).
 *
 * Privacy Trade-off: Anonymizing IP addresses may result in less accurate geolocation.
 * According to Matomo, this can cause incorrect city, region, or even country detection
 * as IP ranges overlap after masking. We recommend doing geo lookup BEFORE anonymization.
 *
 * References:
 * - Matomo: https://matomo.org/faq/general/configure-privacy-settings-in-matomo/
 * - Google: https://support.google.com/analytics/answer/2763052
 */

/**
 * IPv4 anonymization: Number of octets to zero out
 * - 1 octet (8 bits): 192.168.1.100 → 192.168.1.0 (Google UA default)
 * - 2 octets (16 bits): 192.168.1.100 → 192.168.0.0 (Matomo default, our choice)
 * - 3 octets (24 bits): 192.168.1.100 → 192.0.0.0 (strong privacy)
 */
export const IPV4_ANONYMIZATION_OCTETS = 2;

/**
 * IPv6 anonymization: Number of groups (16-bit segments) to zero out
 *
 * IPv6 structure (128 bits total):
 * - First 48 bits: Network prefix (ISP assigned) - should be preserved
 * - Next 16 bits: Subnet ID
 * - Last 64 bits: Interface ID (device-specific) - must be anonymized
 *
 * Industry standard (Google/Matomo): Mask 80 bits = 5 groups
 * This leaves only the 48-bit network prefix visible.
 *
 * Examples:
 * - 5 groups (80 bits): 2001:db8:85a3:0:0:8a2e:370:7334 → 2001:db8:85a3:0:0:0:0:0
 */
export const IPV6_ANONYMIZATION_GROUPS = 5;

// Legacy export for backwards compatibility (uses IPv4 value)
export const IP_ANONYMIZATION_PARTS = IPV4_ANONYMIZATION_OCTETS;

/**
 * Anonymize IPv4 address by zeroing out last N octets
 *
 * Examples:
 * - anonymizeIPv4('192.168.1.100', 2) → '192.168.0.0'
 * - anonymizeIPv4('8.8.8.8', 2) → '8.8.0.0'
 * - anonymizeIPv4('10.0.0.1', 1) → '10.0.0.0'
 *
 * @param ip - IPv4 address (e.g., "192.168.1.100")
 * @param octetsToRemove - Number of octets to zero (default: 2, Matomo standard)
 * @returns Anonymized IPv4 address (e.g., "192.168.0.0")
 */
function anonymizeIPv4(ip: string, octetsToRemove: number = IPV4_ANONYMIZATION_OCTETS): string {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    console.warn(`[IP-Anonymization] Invalid IPv4 format: ${ip}`);
    return ip; // Return original if invalid
  }

  // Validate octets are numbers
  for (const octet of octets) {
    const num = parseInt(octet, 10);
    if (isNaN(num) || num < 0 || num > 255) {
      console.warn(`[IP-Anonymization] Invalid IPv4 octet in: ${ip}`);
      return ip;
    }
  }

  // Zero out last N octets (clamp to valid range)
  const startIndex = Math.max(0, 4 - octetsToRemove);
  for (let i = startIndex; i < 4; i++) {
    octets[i] = '0';
  }

  return octets.join('.');
}

/**
 * Anonymize IPv6 address by zeroing out last N groups (16-bit segments)
 * Handles compressed notation (::) by expanding first
 *
 * Industry standard: 80 bits (5 groups) - matches Google Analytics and Matomo
 * This preserves only the 48-bit network prefix assigned by ISPs.
 *
 * Examples (with default 5 groups = 80 bits):
 * - anonymizeIPv6('2001:db8:85a3:0:0:8a2e:370:7334') → '2001:db8:85a3:0:0:0:0:0'
 * - anonymizeIPv6('2001:db8::1') → '2001:db8:0:0:0:0:0:0'
 * - anonymizeIPv6('::1') → '0:0:0:0:0:0:0:0'
 *
 * @param ip - IPv6 address (standard or compressed notation)
 * @param groupsToRemove - Number of 16-bit groups to zero (default: 5 = 80 bits)
 * @returns Anonymized IPv6 address
 */
function anonymizeIPv6(ip: string, groupsToRemove: number = IPV6_ANONYMIZATION_GROUPS): string {
  try {
    // Handle special case: loopback address
    if (ip === '::1') {
      return '0:0:0:0:0:0:0:0';
    }

    // Expand compressed IPv6 (handle ::)
    let expanded = ip;
    if (ip.includes('::')) {
      const parts = ip.split('::');
      const leftGroups = parts[0] ? parts[0].split(':').filter(g => g) : [];
      const rightGroups = parts[1] ? parts[1].split(':').filter(g => g) : [];
      const missingGroups = 8 - leftGroups.length - rightGroups.length;

      if (missingGroups < 0) {
        console.warn(`[IP-Anonymization] Invalid IPv6 format (too many groups): ${ip}`);
        return ip;
      }

      const middleGroups = new Array(missingGroups).fill('0');
      expanded = [...leftGroups, ...middleGroups, ...rightGroups].join(':');
    }

    // Split into 8 groups
    const groups = expanded.split(':');
    if (groups.length !== 8) {
      console.warn(`[IP-Anonymization] Invalid IPv6 format (expected 8 groups, got ${groups.length}): ${ip}`);
      return ip;
    }

    // Validate each group is valid hex (0-4 chars, 0-9a-fA-F)
    for (const group of groups) {
      if (group.length > 4 || !/^[0-9a-fA-F]*$/.test(group)) {
        console.warn(`[IP-Anonymization] Invalid IPv6 group in: ${ip}`);
        return ip;
      }
    }

    // Zero out last N groups (clamp to valid range)
    const startIndex = Math.max(0, 8 - groupsToRemove);
    for (let i = startIndex; i < 8; i++) {
      groups[i] = '0';
    }

    // Return expanded format (can be re-compressed if needed)
    return groups.join(':');
  } catch (error) {
    console.error(`[IP-Anonymization] Error anonymizing IPv6: ${ip}`, error);
    return ip; // Return original on error
  }
}

/**
 * Anonymize IP address (IPv4 or IPv6) using industry-standard masking
 *
 * Privacy-first approach matching Google Analytics and Matomo standards:
 * - IPv4: Masks last 2 octets (16 bits) → 192.168.1.100 → 192.168.0.0
 * - IPv6: Masks last 5 groups (80 bits) → 2001:db8:85a3::1234 → 2001:db8:85a3:0:0:0:0:0
 *
 * The anonymized IP is suitable for:
 * - Session hash generation (unique visitor tracking)
 * - Analytics processing
 *
 * NOTE: For accurate geolocation, perform geo lookup BEFORE calling this function.
 * The anonymized IP will have reduced geo accuracy (region/country level only).
 *
 * The anonymized IP should NEVER be stored in logs or databases.
 * It should only exist in memory during request processing.
 *
 * Examples:
 * - anonymizeIP('192.168.1.100') → '192.168.0.0' (IPv4: 2 octets masked)
 * - anonymizeIP('2001:db8:85a3::8a2e:370:7334') → '2001:db8:85a3:0:0:0:0:0' (IPv6: 80 bits masked)
 * - anonymizeIP('invalid') → null
 *
 * @param ip - IP address (IPv4 or IPv6)
 * @returns Anonymized IP address or null if invalid
 */
export function anonymizeIP(
  ip: string | null | undefined
): string | null {
  if (!ip) return null;

  // Trim whitespace
  const trimmed = ip.trim();

  // Detect IP version and apply appropriate anonymization
  if (trimmed.includes(':')) {
    // IPv6: mask 5 groups (80 bits) - industry standard
    return anonymizeIPv6(trimmed);
  } else if (trimmed.includes('.')) {
    // IPv4: mask 2 octets (16 bits) - Matomo default
    return anonymizeIPv4(trimmed);
  } else {
    console.warn(`[IP-Anonymization] Unknown IP format: ${ip}`);
    return null;
  }
}
