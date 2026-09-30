import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Activity Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/activity',
      isAuthenticated(true, 'airlink.admin.activity.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/admin/activity')) as Record<
            string,
            unknown
          >;
          res.render('admin/activity/index', {
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
