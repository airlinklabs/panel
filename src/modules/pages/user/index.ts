import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'User Pages',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: 'User-facing pages: dashboard, account, credits, my-images',
  },
  router: () => {
    const router = Router();

    // Dashboard
    router.get('/', isAuthenticated(false), async (req, res, next) => {
      try {
        const data = await apiGet(req, '/servers');
        res.render('user/dashboard', {
          servers: Array.isArray(data) ? data : [],
          user: req.session?.user,
          req,
        });
      } catch (err) {
        next(err);
      }
    });

    // Account page
    router.get('/account', isAuthenticated(false), async (req, res, next) => {
      try {
        const [account, images, folders] = await Promise.all([
          apiGet(req, '/account'),
          apiGet(req, '/account/images', { timeoutMs: 15000 }).catch(() => []),
          apiGet(req, '/account/folders').catch(() => []),
        ]);
        res.render('user/account', {
          account,
          images: Array.isArray(images) ? images : [],
          folders: Array.isArray(folders) ? folders : [],
          user: req.session?.user,
          req,
        });
      } catch (err) {
        next(err);
      }
    });

    // Account actions
    router.post('/change-email', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPatch(req, '/account/email', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/change-password', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPatch(req, '/account/password', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/update-username', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPatch(req, '/account/username', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/update-description', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPatch(req, '/account/description', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/upload-avatar', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPost(req, '/account/avatar', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/remove-avatar', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiDelete(req, '/account/avatar');
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/validate-password', isAuthenticated(false), async (req, res, next) => {
      try {
        const result = await apiPost(req, '/account/validate-password', req.body);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    });

    router.post('/set-language', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPatch(req, '/account/language', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/set-preferred-node', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPatch(req, '/account/preferred-node', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    // 2FA
    router.get('/account/2fa/setup', isAuthenticated(false), async (req, res, next) => {
      try {
        const data = await apiGet(req, '/account/2fa/setup');
        res.json(data);
      } catch (err) {
        next(err);
      }
    });

    router.post('/account/2fa/enable', isAuthenticated(false), async (req, res, next) => {
      try {
        const result = await apiPost(req, '/account/2fa/enable', req.body);
        res.json(result);
      } catch (err) {
        next(err);
      }
    });

    router.post('/account/2fa/disable', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPost(req, '/account/2fa/disable', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    // Credits page — the view is fed by res.locals (templateConfig), no API
    router.get('/credits', isAuthenticated(false), (req, res) => {
      res.render('user/credits', { user: req.session?.user, req });
    });

    // My Images
    router.get('/my-images', isAuthenticated(false), async (req, res, next) => {
      try {
        const images = await apiGet(req, '/account/images', { timeoutMs: 15000 }).catch(() => []);
        res.render('user/my-images/index', {
          images: Array.isArray(images) ? images : [],
          user: req.session?.user,
          req,
        });
      } catch (err) {
        next(err);
      }
    });

    router.get('/my-images/new', isAuthenticated(false), async (req, res, next) => {
      try {
        res.render('user/my-images/new', { user: req.session?.user, req });
      } catch (err) {
        next(err);
      }
    });

    router.get('/my-images/edit/:id', isAuthenticated(false), async (req, res, next) => {
      try {
        const images = await apiGet(req, '/account/images', { timeoutMs: 15000 }).catch(() => []);
        const image = Array.isArray(images)
          ? images.find((img: { id: number }) => img.id === Number(req.params.id))
          : null;
        res.render('user/my-images/edit', {
          image,
          user: req.session?.user,
          req,
        });
      } catch (err) {
        next(err);
      }
    });

    router.post('/my-images/create', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPost(req, '/account/images', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.delete('/my-images/:id', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiDelete(req, `/account/images/${req.params.id}`);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/my-images/import-url', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPost(req, '/account/images/import-url', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    // Folders API (non-v2 — flagged for migration to v2 account endpoints)
    router.get('/api/folders', isAuthenticated(false), async (req, res, next) => {
      try {
        const data = await apiGet(req, '/account/folders');
        res.json(data);
      } catch (err) {
        next(err);
      }
    });

    router.post('/api/folders', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPost(req, '/account/folders', req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.patch('/api/folders/:id', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPatch(req, `/account/folders/${req.params.id}`, req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.delete('/api/folders/:id', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiDelete(req, `/account/folders/${req.params.id}`);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.post('/api/folders/:id/servers', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiPost(req, `/account/folders/${req.params.id}/servers`, req.body);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    router.delete('/api/folders/servers/:serverUUID', isAuthenticated(false), async (req, res, next) => {
      try {
        await apiDelete(req, `/account/folders/servers/${req.params.serverUUID}`);
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    });

    // System routes (flagged for v2 migration — already in v2 system.ts)
    router.post('/api/system/test-node-connection', isAuthenticated(false), async (req, res, next) => {
      try {
        const data = await apiPost(req, '/system/test-node', req.body, { timeoutMs: 15000 });
        res.json(data);
      } catch (err) {
        next(err);
      }
    });

    router.get('/api/system/status', isAuthenticated(false), async (req, res, next) => {
      try {
        const data = await apiGet(req, '/system/status');
        res.json(data);
      } catch (err) {
        next(err);
      }
    });

    router.get('/api/health', async (req, res, next) => {
      try {
        const data = await apiGet(req, '/system/health');
        res.json(data);
      } catch (err) {
        next(err);
      }
    });

    return router;
  },
};

export default module;
