import { Router } from 'express';
import { Module } from '../handlers/moduleInit';
import apiV1Router from './api/v1/api';
import { isAuthenticated } from '../handlers/utils/auth/authUtil';

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

    // Root route handler
    router.get('/', (req, res) => {
      if (req.session?.user) {
      res.redirect('/dashboard');
      } else {
      res.redirect('/login');
      }
    });

    // Mount API v1 routes
    router.use('/api/v1', apiV1Router.router());

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

