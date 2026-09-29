import { Router } from 'express';
import type { Request } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet, apiPost, apiPatch } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Settings Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    /**
     * The settings page posts the whole form (general, security, server
     * policy, features, SMTP, S3) in one payload to the root save endpoint,
     * but v2 exposes one PATCH per section. Fan the payload out to every
     * section — each section DTO keeps only the keys it owns — so the single
     * save button still persists all of them.
     */
    const saveAllSettings = async (req: Request, body: unknown) => {
      const sections = [
        'general',
        'security',
        'server-policy',
        'features',
        'smtp',
        's3',
      ];
      await Promise.all(
        sections.map((section) =>
          apiPatch(req, `/admin/settings/${section}`, body),
        ),
      );
    };

    // -----------------------------------------------------------------------
    // GET /admin/settings — Settings page
    // -----------------------------------------------------------------------
    router.get(
      '/admin/settings',
      isAuthenticated(true, 'airlink.admin.settings.view'),
      async (req, res, next) => {
        try {
          const data: any = (await apiGet(req, '/api/v2/admin/settings'));
          res.render('admin/settings/index', {
            settings: data || {},
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings — Update settings (generic, used by save button)
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await saveAllSettings(req, req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/update — Legacy generic update
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/update',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await saveAllSettings(req, req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/general — Update general settings
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/general',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await apiPatch(req, '/api/v2/admin/settings/general', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/security — Update security settings
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/security',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await apiPatch(req, '/api/v2/admin/settings/security', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/server-policy — Update server policy
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/server-policy',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await apiPatch(req, '/api/v2/admin/settings/server-policy', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/smtp — Update SMTP settings
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/smtp',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await apiPatch(req, '/api/v2/admin/settings/smtp', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/smtp/test — Test SMTP connection
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/smtp/test',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          const result = await apiPost(
            req,
            '/api/v2/admin/settings/smtp/test',
            req.body,
          );
          res.status(200).json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/s3 — Update S3 settings
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/s3',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await apiPatch(req, '/api/v2/admin/settings/s3', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/s3/test — Test S3 connection
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/s3/test',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          const result = await apiPost(
            req,
            '/api/v2/admin/settings/s3/test',
            req.body,
          );
          res.status(200).json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/ban-ip — Ban an IP
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/ban-ip',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/settings/ban-ip', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/unban-ip — Unban an IP
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/unban-ip',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/settings/unban-ip', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/settings/reset — Reset settings
    // -----------------------------------------------------------------------
    router.post(
      '/admin/settings/reset',
      isAuthenticated(true, 'airlink.admin.settings.update'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/settings/reset', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/settings/example-theme — Download example theme
    // -----------------------------------------------------------------------
    router.get(
      '/admin/settings/example-theme',
      isAuthenticated(true, 'airlink.admin.settings.view'),
      async (req, res, next) => {
        try {
          const result = await apiGet(
            req,
            '/api/v2/admin/settings/example-theme',
          );
          res.status(200).json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
