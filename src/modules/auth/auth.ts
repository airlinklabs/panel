import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import logger from '../../handlers/logger';

const authModule: Module = {
  info: {
    name: 'Auth Module',
    description: 'This file is for authentication and authorization of users.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/login', (req: Request, res: Response) => {
      res.render('auth/login', { req, logo: '' });
    });

    router.get('/register', (req: Request, res: Response) => {
      res.render('auth/register', { req, logo: '' });
    });

    router.post('/logout', (req: Request, res: Response) => {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Session destruction error', err);
            return res.status(500).json({ error: 'logout_error' });
          }
          res.clearCookie('connect.sid');
          res.redirect('/');
        });
      } else {
        res.redirect('/');
      }
    });

    return router;
  },
};

export default authModule;
