import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet, apiPost } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Menu Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/menu',
      isAuthenticated(true, 'airlink.admin.menu.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/menu');
          res.render('admin/menu/index', {
            items: Array.isArray(data) ? data : [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get('/menu', isAuthenticated(false), async (_req, res, next) => {
      try {
        res.redirect('/admin/menu');
      } catch (err) {
        next(err);
      }
    });

    router.get(
      '/admin/menu/list',
      isAuthenticated(true, 'airlink.admin.menu.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/menu/list');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/menu',
      isAuthenticated(true, 'airlink.admin.menu.update'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/admin/menu', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/menu/reorder',
      isAuthenticated(true, 'airlink.admin.menu.update'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/admin/menu/reorder', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/menu/delete/:id',
      isAuthenticated(true, 'airlink.admin.menu.delete'),
      async (req, res, next) => {
        try {
          await apiPost(req, `/admin/menu/${req.params.id}/delete`, req.body);
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
