import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Overview Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/overview',
      isAuthenticated(true, 'airlink.admin.overview.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/admin/overview')) as Record<
            string,
            unknown
          >;
          res.render('admin/overview/index', {
            ...data,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
