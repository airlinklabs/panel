import { Router, Request, Response } from 'express';
import { Module } from '../handlers/moduleInit';

const dashboardModule: Module = {
  info: {
    name: 'Dashboard Module',
    description: 'This file is for dashboard functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/dashboard', (req: Request, res: Response) => {
      const errorMessage = {};
      res.render('user/dashboard', { errorMessage });
    });

    return router;
  },
};

export default dashboardModule;
