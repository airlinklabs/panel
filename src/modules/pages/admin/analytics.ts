import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Analytics Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/analytics',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/admin/analytics')) as Record<
            string,
            unknown
          >;
          res.render('admin/analytics/index', {
            ...data,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/analytics/servers',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/analytics');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/analytics/users',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/analytics');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/analytics/network',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/analytics');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/analytics/hardware',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/analytics');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
