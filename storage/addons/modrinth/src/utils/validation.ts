// ── Input Validation Utilities ──
// Sanitize and validate user input before passing to APIs or DB.

import { MAX_SEARCH_LENGTH, MAX_RESULTS_PER_PAGE } from '../types/modrinth';

/**
 * Validate and sanitize a search query string.
 * Returns the sanitized query, or null if invalid.
 */
export function sanitizeSearchQuery(query: string | undefined | null): string | null {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SEARCH_LENGTH) return null;
  // Remove any characters that could be used for injection
  return trimmed.replace(/[<>"'`;]/g, '');
}

/**
 * Validate and sanitize a numeric offset parameter.
 * Returns the offset (>= 0), or the default.
 */
export function sanitizeOffset(offset: string | undefined | null, defaultValue = 0): number {
  if (!offset) return defaultValue;
  const n = parseInt(offset, 10);
  if (isNaN(n) || n < 0) return defaultValue;
  return n;
}

/**
 * Validate and sanitize a limit parameter.
 * Returns the limit clamped to [1, MAX_RESULTS_PER_PAGE].
 */
export function sanitizeLimit(limit: string | undefined | null, defaultValue = 20): number {
  if (!limit) return defaultValue;
  const n = parseInt(limit, 10);
  if (isNaN(n) || n < 1) return defaultValue;
  return Math.min(n, MAX_RESULTS_PER_PAGE);
}

/**
 * Validate a Modrinth project/version ID format.
 * Modrinth IDs are typically alphanumeric with hyphens, 8-64 chars.
 */
export function isValidModrinthId(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

/**
 * Validate a project type string.
 */
export function isValidProjectType(type: string | undefined | null): boolean {
  if (!type) return false;
  return ['mod', 'modpack', 'resourcepack', 'shader', 'datapack', 'plugin'].includes(type);
}

/**
 * Validate and sanitize a server ID (UUID format or numeric).
 */
export function sanitizeServerId(id: string | undefined | null): string | null {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  // Allow UUIDs and numeric IDs
  if (/^[0-9a-f-]{1,128}$/i.test(trimmed) || /^[0-9]{1,10}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Validate a sort index value.
 */
export function sanitizeSortIndex(index: string | undefined | null): string {
  const valid = ['relevance', 'downloads', 'follows', 'newest', 'updated'];
  if (!index || !valid.includes(index)) return 'relevance';
  return index;
}

/**
 * Clamp a page number to >= 1.
 */
export function sanitizePage(page: string | undefined | null): number {
  if (!page) return 1;
  const n = parseInt(page, 10);
  if (isNaN(n) || n < 1) return 1;
  return n;
}
