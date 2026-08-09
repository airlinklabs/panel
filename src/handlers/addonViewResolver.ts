/**
 * Addon view resolution.
 *
 * Replaces the old global `ejs.renderFile` monkey-patch. Addon views may only
 * be resolved from storage/addons/<valid-slug>/views/... — never from paths
 * built out of unvalidated request data (e.g. a `slug` query/path parameter).
 *
 * Two independent guards are applied:
 *   1. The slug must match the same pattern used for addon identifiers.
 *   2. The resolved path must stay inside the addon's views directory
 *      (defence in depth against any future caller passing a dotted name).
 */

import path from 'path';
import fs from 'fs';

/** Pattern shared with addon identifiers: lowercase alnum, dash, ≤48 chars. */
export const ADDON_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function isValidAddonSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && ADDON_SLUG_REGEX.test(slug);
}

/**
 * Resolves `viewName` inside the given addon's views directory.
 * Returns the absolute path when the file exists and is contained, else null.
 * `viewName` may contain `/` for nested templates, but never `..`.
 */
export function resolveAddonViewPath(
  addonsRoot: string,
  slug: string,
  viewName: string,
): string | null {
  if (!isValidAddonSlug(slug)) {return null;}
  if (typeof viewName !== 'string' || viewName.length === 0) {return null;}
  if (viewName.includes('\0') || viewName.split(/[\\/]/).some((seg) => seg === '..')) {
    return null;
  }

  const viewsBase = path.resolve(addonsRoot, slug, 'views');
  const target = path.resolve(viewsBase, viewName);

  if (target !== viewsBase && !target.startsWith(viewsBase + path.sep)) {
    return null;
  }

  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {return null;}
  } catch {
    return null;
  }
  return target;
}
