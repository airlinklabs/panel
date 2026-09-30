/**
 * Shared in-memory cache for security settings (rate limits, banned IPs).
 * Refreshed periodically from DB and also on-demand after admin changes.
 */
import { getSettings } from './settingsCache';
import { DEFAULT_RATE_LIMIT_RPM } from '../config/ui';

const securityCache = {
  bannedIps: [] as string[],
  rateLimitEnabled: true,
  rateLimitRpm: DEFAULT_RATE_LIMIT_RPM,
};

export async function refreshSecurityCache() {
  try {
    const s = await getSettings();
    if (!s) {
      return;
    }
    securityCache.bannedIps = Array.isArray(s.bannedIps)
      ? (s.bannedIps as string[])
      : [];
    securityCache.rateLimitEnabled = s.rateLimitEnabled;
    securityCache.rateLimitRpm = s.rateLimitRpm || DEFAULT_RATE_LIMIT_RPM;
  } catch {
    /* DB not ready */
  }
}

export function getSecurityCache() {
  return securityCache;
}
