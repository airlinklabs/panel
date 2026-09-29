import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import {
  apiGet,
  apiPost,
  apiDelete,
} from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Addons Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    // -----------------------------------------------------------------------
    // GET /admin/addons — List installed addons
    // -----------------------------------------------------------------------
    router.get(
      '/admin/addons',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/api/v2/admin/addons')) as any;
          res.render('admin/addons/index', {
            addons: data || [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/addons/list — Addons list (JSON)
    // -----------------------------------------------------------------------
    router.get(
      '/admin/addons/list',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req, res, next) => {
        try {
          const data: any = await apiGet(req, '/api/v2/admin/addons');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/addons/:slug — Addon detail
    // -----------------------------------------------------------------------
    router.get(
      '/admin/addons/:slug',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(
            req,
            `/api/v2/admin/addons/${req.params.slug}`,
          )) as any;
          res.render('admin/addons/detail', {
            addon: data || {},
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/addons/toggle/:slug — Toggle addon
    // -----------------------------------------------------------------------
    router.post(
      '/admin/addons/toggle/:slug',
      isAuthenticated(true, 'airlink.admin.addons.update'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/addons/${req.params.slug}/toggle`,
            req.body,
          );
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/addons/reload — Reload all addons
    // -----------------------------------------------------------------------
    router.post(
      '/admin/addons/reload',
      isAuthenticated(true, 'airlink.admin.addons.update'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/addons/reload', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/addons/settings/:slug — Update addon settings
    // -----------------------------------------------------------------------
    router.post(
      '/admin/addons/settings/:slug',
      isAuthenticated(true, 'airlink.admin.addons.update'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/addons/${req.params.slug}/settings`,
            req.body,
          );
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/addons/command/:slug/:command — Run addon command
    // -----------------------------------------------------------------------
    router.post(
      '/admin/addons/command/:slug/:command',
      isAuthenticated(true, 'airlink.admin.addons.update'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/addons/${req.params.slug}/command/${req.params.command}`,
            req.body,
          );
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/addons/capability/:slug — Toggle addon capability
    // -----------------------------------------------------------------------
    router.post(
      '/admin/addons/capability/:slug',
      isAuthenticated(true, 'airlink.admin.addons.update'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/addons/${req.params.slug}/capability`,
            req.body,
          );
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/addons/uninstall/:slug — Uninstall addon
    // -----------------------------------------------------------------------
    router.post(
      '/admin/addons/uninstall/:slug',
      isAuthenticated(true, 'airlink.admin.addons.uninstall'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/addons/${req.params.slug}/uninstall`,
            req.body,
          );
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/addons/store — Addon store
    // -----------------------------------------------------------------------
    router.get(
      '/admin/addons/store',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/api/v2/admin/addons/store')) as any;
          res.render('admin/addons/store', {
            addons: data || [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/addons/store/list — Store list (JSON)
    // -----------------------------------------------------------------------
    router.get(
      '/admin/addons/store/list',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req, res, next) => {
        try {
          const data: any = await apiGet(req, '/api/v2/admin/addons/store/list');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/addons/store/discussions — Store discussions
    // -----------------------------------------------------------------------
    router.get(
      '/admin/addons/store/discussions',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req, res, next) => {
        try {
          const data: any = await apiGet(
            req,
            '/api/v2/admin/addons/store/discussions',
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/addons/store/install — Install from store
    // -----------------------------------------------------------------------
    router.post(
      '/admin/addons/store/install',
      isAuthenticated(true, 'airlink.admin.addons.install'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/addons/store/install', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/addons/store/uninstall — Uninstall from store
    // -----------------------------------------------------------------------
    router.post(
      '/admin/addons/store/uninstall',
      isAuthenticated(true, 'airlink.admin.addons.uninstall'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/addons/store/uninstall', req.body);
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
