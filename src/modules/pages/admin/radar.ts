import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet, apiPost } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

/**
 * Plain-object guard: API payloads are handed to EJS as named locals only —
 * never spread into res.render (EJS reserves `settings`/`filename`/…
 * internally and circular objects blow up the render).
 */
function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const module: Module = {
  info: {
    name: 'Admin Radar Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/radar',
      isAuthenticated(true, 'airlink.admin.radar.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/radar');
          const radar = asObject(data);
          // The tab view reads `settings.virusTotalApiKey`; accept either a
          // nested `{ settings: {...} }` payload or the settings row itself.
          const nested = radar.settings;
          const settings =
            nested !== null &&
            typeof nested === 'object' &&
            !Array.isArray(nested)
              ? (nested as Record<string, unknown>)
              : radar;
          res.render('admin/radar/index', {
            radar,
            settings,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/radar/scripts',
      isAuthenticated(true, 'airlink.admin.radar.scripts.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/radar/scripts');
          res.render('admin/radar/scripts/index', {
            scripts: Array.isArray(data) ? data : [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // Create form — authored against no API data, so no fetch at all.
    router.get(
      '/admin/radar/scripts/create',
      isAuthenticated(true, 'airlink.admin.radar.scripts.create'),
      (req, res) => {
        res.render('admin/radar/scripts/create', {
          user: req.session?.user,
          req,
        });
      },
    );

    router.get(
      '/admin/radar/scripts/edit/:id',
      isAuthenticated(true, 'airlink.admin.radar.scripts.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, `/admin/radar/scripts/${req.params.id}`);
          res.render('admin/radar/scripts/edit', {
            script: asObject(data),
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // The VirusTotal tab lives on the radar index page now.
    router.get(
      '/admin/radar/virustotal',
      isAuthenticated(true, 'airlink.admin.radar.virustotal.view'),
      (_req, res) => {
        res.redirect('/admin/radar#virustotal');
      },
    );

    // JSON proxy for the VT hash-lookup fetch on the radar index page.
    router.get(
      '/admin/radar/virustotal/scan/:hash',
      isAuthenticated(true, 'airlink.admin.radar.virustotal.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, `/admin/radar/virustotal/scan/${req.params.hash}`);
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/radar/scripts',
      isAuthenticated(true, 'airlink.admin.radar.scripts.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/admin/radar/scripts', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/radar/scripts/:id',
      isAuthenticated(true, 'airlink.admin.radar.scripts.update'),
      async (req, res, next) => {
        try {
          await apiPost(req, `/admin/radar/scripts/${req.params.id}`, req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/radar/scripts/:id/delete',
      isAuthenticated(true, 'airlink.admin.radar.scripts.delete'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/admin/radar/scripts/${req.params.id}/delete`,
            req.body,
          );
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // Saves VT config (enabled + apiKey) — endpoint exists in v2 misc.
    router.post(
      '/admin/radar/virustotal',
      isAuthenticated(true, 'airlink.admin.radar.virustotal.scan'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/admin/radar/virustotal', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/radar/virustotal/:hash',
      isAuthenticated(true, 'airlink.admin.radar.virustotal.scan'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/admin/radar/virustotal/${req.params.hash}`,
            req.body,
          );
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
