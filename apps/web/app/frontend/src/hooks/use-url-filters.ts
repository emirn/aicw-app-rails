import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import type { TrafficChannel } from '@/types/tinybird';

interface UseUrlFiltersReturn {
  channelFilter: TrafficChannel[];
  pageFilter: string | null;
  countryFilter: string | null;
  setChannelFilter: (channels: TrafficChannel[]) => void;
  toggleChannel: (channel: TrafficChannel) => void;
  setPageFilter: (page: string | null) => void;
  setCountryFilter: (country: string | null) => void;
  clearAllFilters: () => void;
  hasActiveFilters: boolean;
}

// Validation regex patterns
const VALID_CHANNEL_VALUES = ['ai', 'search', 'direct', 'other'] as const;
const ISO2_COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;
const SAFE_PAGE_PATH_REGEX = /^[a-zA-Z0-9\-_/.%~]*$/;

/**
 * Hook to manage URL-synced filters for analytics dashboard
 * Enables shareable/bookmarkable filtered views via URL params
 * All filter values are validated to prevent injection attacks
 *
 * Channel filter supports multi-select:
 * - Empty array [] = all channels (no filter)
 * - ['ai', 'direct'] = only those channels
 * - URL format: ?channels=ai,direct
 * - Backward compatible with legacy ?channel=ai format
 */
export function useUrlFilters(): UseUrlFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse channels from URL - supports multi-select
  const channelFilter = useMemo(() => {
    // Try new format first: ?channels=ai,direct
    const channelsParam = searchParams.get('channels');
    if (channelsParam) {
      const channels = channelsParam
        .split(',')
        .map(c => c.trim())
        .filter(c => VALID_CHANNEL_VALUES.includes(c as TrafficChannel))
        .map(c => c as TrafficChannel);
      return channels;
    }

    // Backward compat: legacy ?channel=ai format (single value)
    const legacyParam = searchParams.get('channel');
    if (legacyParam && VALID_CHANNEL_VALUES.includes(legacyParam as TrafficChannel)) {
      return [legacyParam as TrafficChannel];
    }

    return [];
  }, [searchParams]);

  const pageFilter = useMemo(() => {
    const page = searchParams.get('page');
    // Validate page path contains only safe characters
    if (page && SAFE_PAGE_PATH_REGEX.test(page)) {
      return page;
    }
    return null;
  }, [searchParams]);

  const countryFilter = useMemo(() => {
    const country = searchParams.get('country');
    // Validate country code is exactly 2 uppercase letters (ISO 3166-1 alpha-2)
    if (country && ISO2_COUNTRY_CODE_REGEX.test(country.toUpperCase())) {
      return country.toUpperCase();
    }
    return null;
  }, [searchParams]);

  const hasActiveFilters = useMemo(() => {
    return channelFilter.length > 0 || pageFilter !== null || countryFilter !== null;
  }, [channelFilter, pageFilter, countryFilter]);

  const setChannelFilter = useCallback((channels: TrafficChannel[]) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      // Clean up legacy param
      newParams.delete('channel');

      if (channels.length > 0) {
        // Validate each channel
        const validChannels = channels.filter(c =>
          VALID_CHANNEL_VALUES.includes(c)
        );
        if (validChannels.length > 0) {
          newParams.set('channels', validChannels.join(','));
        } else {
          newParams.delete('channels');
        }
      } else {
        newParams.delete('channels');
      }
      return newParams;
    });
  }, [setSearchParams]);

  // Toggle single channel on/off (for click behavior)
  const toggleChannel = useCallback((channel: TrafficChannel) => {
    if (!VALID_CHANNEL_VALUES.includes(channel)) return;

    const isSelected = channelFilter.includes(channel);
    if (isSelected) {
      // Remove from selection
      setChannelFilter(channelFilter.filter(c => c !== channel));
    } else {
      // Add to selection
      setChannelFilter([...channelFilter, channel]);
    }
  }, [channelFilter, setChannelFilter]);

  const setPageFilter = useCallback((page: string | null) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      if (page) {
        newParams.set('page', page);
      } else {
        newParams.delete('page');
      }
      return newParams;
    });
  }, [setSearchParams]);

  const setCountryFilter = useCallback((country: string | null) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      if (country) {
        // Normalize to uppercase and validate
        const normalized = country.toUpperCase();
        if (ISO2_COUNTRY_CODE_REGEX.test(normalized)) {
          newParams.set('country', normalized);
        }
      } else {
        newParams.delete('country');
      }
      return newParams;
    });
  }, [setSearchParams]);

  const clearAllFilters = useCallback(() => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('channels');
      newParams.delete('channel'); // Legacy cleanup
      newParams.delete('page');
      newParams.delete('country');
      return newParams;
    });
  }, [setSearchParams]);

  return {
    channelFilter,
    pageFilter,
    countryFilter,
    setChannelFilter,
    toggleChannel,
    setPageFilter,
    setCountryFilter,
    clearAllFilters,
    hasActiveFilters,
  };
}
