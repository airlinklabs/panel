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
    name: 'Admin Databases Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/databases',
      isAuthenticated(true, 'airlink.admin.databases.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/api/v2/admin/databases')) as any;
          res.render('admin/databases/index', {
            hosts: data || [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/databases/create',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req, res, next) => {
        try {
          const [nodesRes, settingsRes] = await Promise.all([
            apiGet(req, '/api/v2/admin/nodes') as Promise<any>,
            apiGet(req, '/api/v2/admin/settings') as Promise<any>,
          ]);
          res.render('admin/databases/create', {
            nodes: nodesRes || [],
            settings: settingsRes || {},
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/databases/create',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/databases', req.body);
          res.redirect('/admin/databases');
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/databases/:id/test',
      isAuthenticated(true, 'airlink.admin.databases.test'),
      async (req, res, next) => {
        try {
          const result = await apiPost(
            req,
            `/api/v2/admin/databases/${req.params.id}/test`,
            req.body,
          );
          res.json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/databases/auto-host',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req, res, next) => {
        try {
          const result = await apiPost(
            req,
            '/api/v2/admin/databases/auto-host',
            req.body,
          );
          res.json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/databases/auto-bucket',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req, res, next) => {
        try {
          const result = await apiPost(
            req,
            '/api/v2/admin/databases/auto-bucket',
            req.body,
          );
          res.json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    router.delete(
      '/admin/databases/:id',
      isAuthenticated(true, 'airlink.admin.databases.delete'),
      async (req, res, next) => {
        try {
          await apiDelete(req, `/api/v2/admin/databases/${req.params.id}`);
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
