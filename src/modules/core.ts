import { Router } from 'express';
import { Module } from '../handlers/moduleInit';
import apiV1Router from './api/v1/api';
import alternativeApiModule from './api/Alternative/api';

const coreModule: Module = {
  info: {
    name: 'Core Module',
    description: 'Core functionality including API system',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // Mount API v1 routes
    router.use('/api/v1', apiV1Router);

    // Mount Alternative API routes (legacy support)
    router.use('/api/alternative', alternativeApiModule.router);

    // API Documentation redirect
    router.get('/api', (_req, res) => {
      res.redirect('/api/docs');
    });

    // Health check endpoint
    router.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    return router;
  },
};

export default coreModule;
