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
    name: 'Admin Locations Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/locations',
      isAuthenticated(true, 'airlink.admin.locations.view'),
      async (_req, res, next) => {
        try {
          res.redirect('/admin/nodes#locations');
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/locations',
      isAuthenticated(true, 'airlink.admin.locations.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/locations', req.body);
          res.status(200).json({ message: 'Location created successfully.' });
        } catch (err) {
          next(err);
        }
      },
    );

    router.put(
      '/admin/location/:id',
      isAuthenticated(true, 'airlink.admin.locations.update'),
      async (req, res, next) => {
        try {
          await apiPut(
            req,
            `/api/v2/admin/locations/${req.params.id}`,
            req.body,
          );
          res.status(200).json({ message: 'Location updated.' });
        } catch (err) {
          next(err);
        }
      },
    );

    router.delete(
      '/admin/location/:id',
      isAuthenticated(true, 'airlink.admin.locations.delete'),
      async (req, res, next) => {
        try {
          await apiDelete(req, `/api/v2/admin/locations/${req.params.id}`);
          res.status(200).json({ message: 'Location deleted successfully.' });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/location/:id/nodes',
      isAuthenticated(true, 'airlink.admin.locations.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(
            req,
            `/api/v2/admin/locations/${req.params.id}/nodes`,
          );
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
