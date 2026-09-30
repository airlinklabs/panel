import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet, apiPost } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Queue Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/queue',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/admin/queue')) as Record<
            string,
            unknown
          >;
          res.render('admin/queue/index', {
            entries: data,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/queue/:serverId/kick',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req, res, next) => {
        try {
          const result = await apiPost(
            req,
            `/admin/queue/${req.params.serverId}/kick`,
            req.body,
          );
          res.json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/queue/users/:userId/ban',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req, res, next) => {
        try {
          const result = await apiPost(
            req,
            `/admin/queue/users/${req.params.userId}/ban`,
            req.body,
          );
          res.json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/queue/users/:userId/unban',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req, res, next) => {
        try {
          const result = await apiPost(
            req,
            `/admin/queue/users/${req.params.userId}/unban`,
            req.body,
          );
          res.json(result);
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
