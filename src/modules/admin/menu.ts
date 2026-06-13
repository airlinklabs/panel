import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { registerPermission } from '../../handlers/permissions';

registerPermission('airlink.admin.menu.main');

const adminModule: Module = {
  info: {
    name: 'Admin Menu Module',
    description: 'Mobile admin menu navigation hub.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/menu',
      isAuthenticated(true, 'airlink.admin.menu.main'),
      (req: Request, res: Response) => {
        res.locals.isMobileViewport = true;
        res.render('admin/menu', {
          adminMenuItems: res.locals.adminMenuItems || [],
        });
      },
    );

    return router;
  },
};

export default adminModule;
