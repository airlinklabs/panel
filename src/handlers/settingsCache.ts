import prisma from '../db';
import { cache } from './cache';

const SETTINGS_KEY = 'settings:main';
const SETTINGS_TTL = 300; // 5 minutes

/**
 * Get panel settings with Redis cache. Settings are read on virtually
 * every page load (~106 occurrences across the codebase). Caching
 * eliminates the repeated SELECT on the settings table.
 *
 * Call `invalidateSettingsCache()` after any settings write to ensure
 * fresh reads.
 */
export async function getSettings() {
  return cache.wrap(SETTINGS_KEY, SETTINGS_TTL, () =>
    prisma.settings.findUnique({ where: { id: 1 } })
  );
}

/**
 * Invalidate the settings cache. Must be called after any settings
 * mutation (update, reset, etc.) so subsequent reads get fresh data.
 */
export async function invalidateSettingsCache() {
  await cache.del(SETTINGS_KEY);
}
