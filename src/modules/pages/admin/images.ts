import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
} from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Images Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    // ── List ────────────────────────────────────────────────────────────
    router.get(
      '/admin/images',
      isAuthenticated(true, 'airlink.admin.images.view'),
      async (req, res, next) => {
        try {
          const [images, pending] = await Promise.all([
            apiGet(req, '/admin/images?perPage=9999'),
            apiGet(req, '/admin/images/pending').catch(() => []),
          ]);
          res.render('admin/images/index', {
            images: Array.isArray(images) ? images : [],
            pending: Array.isArray(pending) ? pending : [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── JSON list (AJAX reload) ─────────────────────────────────────────
    router.get(
      '/admin/images/list',
      isAuthenticated(true, 'airlink.admin.images.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/api/v2/admin/images/list');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Edit form ───────────────────────────────────────────────────────
    router.get(
      '/admin/images/edit/:id',
      isAuthenticated(true, 'airlink.admin.images.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(
            req,
            `/api/v2/admin/images/${req.params.id}`,
          );
          res.render('admin/images/edit', {
            ...((data as Record<string, unknown>) || {}),
            image: data,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Submit edit ─────────────────────────────────────────────────────
    router.post(
      '/admin/images/edit/:id',
      isAuthenticated(true, 'airlink.admin.images.update'),
      async (req, res, next) => {
        try {
          await apiPut(req, `/api/v2/admin/images/${req.params.id}`, req.body);
          res.redirect(`/admin/images/edit/${req.params.id}?success=true`);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Create ──────────────────────────────────────────────────────────
    router.post(
      '/admin/images/create',
      isAuthenticated(true, 'airlink.admin.images.create'),
      async (req, res, next) => {
        try {
          const result = (await apiPost(
            req,
            '/api/v2/admin/images',
            req.body,
          )) as Record<string, unknown>;
          res.redirect(`/admin/images/edit/${String(result?.id)}?success=true`);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Delete ──────────────────────────────────────────────────────────
    router.delete(
      '/admin/images/delete/:id',
      isAuthenticated(true, 'airlink.admin.images.delete'),
      async (req, res, next) => {
        try {
          await apiDelete(req, `/api/v2/admin/images/${req.params.id}`);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Upload ──────────────────────────────────────────────────────────
    router.post(
      '/admin/images/upload',
      isAuthenticated(true, 'airlink.admin.images.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/images/upload', req.body);
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Import from URL ─────────────────────────────────────────────────
    router.post(
      '/admin/images/import-url',
      isAuthenticated(true, 'airlink.admin.images.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/images/import-url', req.body);
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Export / download ───────────────────────────────────────────────
    router.get(
      '/admin/images/export/:id',
      isAuthenticated(true, 'airlink.admin.images.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(
            req,
            `/api/v2/admin/images/${req.params.id}/export`,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Approvals (redirect to tab) ─────────────────────────────────────
    router.get(
      '/admin/images/approvals',
      isAuthenticated(true, 'airlink.admin.images.view'),
      async (_req, res, next) => {
        try {
          res.redirect('/admin/images#approvals');
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Approve ─────────────────────────────────────────────────────────
    router.post(
      '/admin/images/approve/:id',
      isAuthenticated(true, 'airlink.admin.images.approve'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/images/${req.params.id}/approve`,
            req.body,
          );
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Reject ──────────────────────────────────────────────────────────
    router.post(
      '/admin/images/reject/:id',
      isAuthenticated(true, 'airlink.admin.images.reject'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/images/${req.params.id}/reject`,
            req.body,
          );
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Store (redirect to tab) ─────────────────────────────────────────
    router.get(
      '/admin/images/store',
      isAuthenticated(true, 'airlink.admin.images.view'),
      async (_req, res, next) => {
        try {
          res.redirect('/admin/images#store');
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Store catalogue (AJAX) ──────────────────────────────────────────
    router.get(
      '/admin/images/store/catalogue',
      isAuthenticated(true, 'airlink.admin.images.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(
            req,
            '/api/v2/admin/images/store/catalogue',
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Store panel (fragment) ──────────────────────────────────────────
    router.get(
      '/admin/images/store/panel',
      isAuthenticated(true, 'airlink.admin.images.view'),
      async (_req, res, next) => {
        try {
          res.render('admin/images/store-panel');
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Store install ───────────────────────────────────────────────────
    router.post(
      '/admin/images/store/install',
      isAuthenticated(true, 'airlink.admin.images.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/images/store/install', req.body);
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Store refresh ───────────────────────────────────────────────────
    router.post(
      '/admin/images/store/refresh',
      isAuthenticated(true, 'airlink.admin.images.update'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/images/store/refresh', {});
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
