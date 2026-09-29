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
    name: 'Admin Users Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/users',
      isAuthenticated(true, 'airlink.admin.users.view'),
      async (req, res, next) => {
        try {
          const result = (await apiGet(req, '/api/v2/admin/users')) as {
            data?: unknown[];
            meta?: Record<string, unknown>;
          };
          const users = result || [];
          const meta = result.meta;
          res.render('admin/users/index', {
            users,
            meta,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/users/create',
      isAuthenticated(true, 'airlink.admin.users.view'),
      async (req, res, next) => {
        try {
          res.render('admin/users/create', {
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/users/create-user',
      isAuthenticated(true, 'airlink.admin.users.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/users', req.body);
          res.status(200).json({ message: 'User created successfully.' });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/users/edit/:id',
      isAuthenticated(true, 'airlink.admin.users.edit'),
      async (req, res, next) => {
        try {
          const result = (await apiGet(
            req,
            `/api/v2/admin/users/${req.params.id}`,
          )) as { data?: Record<string, unknown> };
          const dataUser = result;
          res.render('admin/users/edit', {
            dataUser,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/users/update/:id',
      isAuthenticated(true, 'airlink.admin.users.edit'),
      async (req, res, next) => {
        try {
          await apiPut(req, `/api/v2/admin/users/${req.params.id}`, req.body);
          res.status(200).json({ message: 'User updated successfully' });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/users/view/:id',
      isAuthenticated(true, 'airlink.admin.users.view'),
      async (req, res, next) => {
        try {
          const result = (await apiGet(
            req,
            `/api/v2/admin/users/${req.params.id}`,
          )) as { data?: Record<string, unknown> };
          const dataUser = result;
          res.render('admin/users/view', {
            dataUser,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.delete(
      '/admin/users/delete/:id',
      isAuthenticated(true, 'airlink.admin.users.delete'),
      async (req, res, next) => {
        try {
          await apiDelete(req, `/api/v2/admin/users/${req.params.id}`);
          res.status(200).json({ message: 'User deleted successfully.' });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/users/transfer-owner/:id',
      isAuthenticated(true, 'airlink.admin.users.edit'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/users/${req.params.id}/transfer`,
            req.body,
          );
          res.status(200).json({ message: 'Ownership transferred.' });
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
