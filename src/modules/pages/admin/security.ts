import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Security Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    // The security page is a single tabbed view fed by admin settings; every
    // per-tab sub-route (2fa, captcha, logins, passwords, …) was dropped —
    // nothing links to them and no test references them.
    router.get(
      '/admin/security',
      isAuthenticated(true, 'airlink.admin.security.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/api/v2/admin/settings');
          res.render('admin/security/index', {
            settings: data && typeof data === 'object' ? data : {},
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
