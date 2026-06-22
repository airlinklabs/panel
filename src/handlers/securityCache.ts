/**
 * Shared in-memory cache for security settings (rate limits, banned IPs).
 * Refreshed periodically from DB and also on-demand after admin changes.
 */
import prisma from '../db';

const securityCache = {
  bannedIps: [] as string[],
  rateLimitEnabled: true,
  rateLimitRpm: 500,
};

export async function refreshSecurityCache() {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    if (!s) return;
    try { securityCache.bannedIps = JSON.parse(s.bannedIps || '[]'); } catch { securityCache.bannedIps = []; }
    securityCache.rateLimitEnabled = s.rateLimitEnabled;
    securityCache.rateLimitRpm = s.rateLimitRpm || 500;
  } catch { /* DB not ready */ }
}

export function getSecurityCache() {
  return securityCache;
}
