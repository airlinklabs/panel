import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';

const adminModule: Module = {
  info: {
    name: 'Admin Security Module',
    description: 'Security settings for the panel.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // Security management lives in the Admin Settings page (Security tab).
    router.get(
      '/admin/security',
      isAuthenticated(true),
      (_req: Request, res: Response) => {
        res.redirect('/admin/settings');
      },
    );

    return router;
  },
};

export default adminModule;
