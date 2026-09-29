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
    name: 'Admin Mounts Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/mounts',
      isAuthenticated(true, 'airlink.admin.mounts.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/api/v2/admin/mounts')) as any;
          res.render('admin/mounts/index', {
            mounts: data || [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/mounts/new',
      isAuthenticated(true, 'airlink.admin.mounts.create'),
      async (req, res, next) => {
        try {
          res.render('admin/mounts/new', {
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/mounts',
      isAuthenticated(true, 'airlink.admin.mounts.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/mounts', req.body);
          res.status(200).json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    router.delete(
      '/admin/mounts/:id',
      isAuthenticated(true, 'airlink.admin.mounts.delete'),
      async (req, res, next) => {
        try {
          await apiDelete(req, `/api/v2/admin/mounts/${req.params.id}`);
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
