/**
 * Explicit primary/addon view render resolver.
 *
 * Replaces the inline `res.render` override that previously lived inside
 * app.ts. The app mounts this as ordinary middleware; the resolver owns all
 * view-resolution policy:
 *
 *   1. Absolute paths and paths inside storage/addons render directly via EJS.
 *   2. Primary views resolve against the configured views dir.
 *   3. If a primary view is missing, addon views are tried as a fallback.
 *      Request-derived slugs are validated (see addonViewResolver.ts) and
 *      every resolved path is contained inside the addon's views directory.
 *
 * No global `ejs.renderFile` monkey-patch is used anywhere.
 */

import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import logger from './logger';
import { isProductionPosture } from '../utils/errors';
import {
  resolveAddonViewPath,
  isValidAddonSlug,
  getAddonDirs,
} from './addonViewResolver';

type RenderCallback = (err: Error | null, html?: string) => void;
type RenderOverrides = object | RenderCallback;

function renderFileDirect(
  res: Response,
  filePath: string,
  data: Record<string, unknown>,
  callback?: RenderCallback,
): void {
  ejs.renderFile(filePath, data, {}, (err: Error | null, html: string) => {
    if (err) {
      if (callback) {return callback(err);}
      logger.error('View render error:', err);
      return res.status(500).send('View render error');
    }
    if (callback) {return callback(null, html);}
    res.send(html);
  });
}

export interface RenderResolverOptions {
  viewsPath: string;
  addonViewsDir: string;
  /** Returns the set of installed addon slugs to fall back to (newest last). */
  getAddonDirs?: () => string[];
}

/**
 * Middleware that installs the explicit primary/addon-aware `res.render`.
 * Mount before any route handlers; views resolve lazily at render time.
 */
export function installRenderResolver(options: RenderResolverOptions) {
  const { viewsPath, addonViewsDir, getAddonDirs: listAddonDirs = () => getAddonDirs(addonViewsDir) } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const originalRenderBase = res.render.bind(res);

    const renderOverride = function (
      view: string,
      options?: RenderOverrides,
      callback?: RenderCallback,
    ): void {
      let opts: object;
      if (typeof options === 'function') {
        callback = options as RenderCallback;
        opts = {};
      } else {
        opts = options || {};
      }

      const data = { ...res.locals, ...opts };

      const isAbsolutePath = path.isAbsolute(view);
      const isAddonView = view.includes('/storage/addons/') || view.includes('\\storage\\addons\\');

      if (isAbsolutePath || isAddonView) {
        renderFileDirect(res, view, data, callback);
        return;
      }

      const viewPath = path.join(viewsPath, `${view}.ejs`);
      if (!fs.existsSync(viewPath)) {
        const tryRenderAddonView = (addonSlug: string): boolean => {
          const addonFallbackPath = resolveAddonViewPath(addonViewsDir, addonSlug, `${view}.ejs`);
          if (!addonFallbackPath) {return false;}
          ejs.renderFile(addonFallbackPath, data, {}, (err: Error | null, html: string) => {
            if (err) {
              if (callback) {return callback(err);}
              return res.status(500).send(
                isProductionPosture() ? 'View render error' : `View render error: ${err.message}`,
              );
            }
            if (callback) {return callback(null, html);}
            res.send(html);
          });
          return true;
        };

        const requestedSlug = (opts as { addonSlug?: unknown }).addonSlug;
        if (isValidAddonSlug(requestedSlug) && tryRenderAddonView(requestedSlug)) {
          return;
        }

        for (const addonDir of listAddonDirs()) {
          if (requestedSlug === addonDir) {continue;}
          if (tryRenderAddonView(addonDir)) {return;}
        }
      }

      originalRenderBase(view, opts, callback);
    };

    res.render = renderOverride as typeof res.render;
    next();
  };
}
