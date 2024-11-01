import { Router, Request, Response } from 'express';
import { Module } from '../handlers/moduleInit';

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
      const errorMessage =
        req.query.err === 'incorrect_password'
          ? 'Invalid login credentials. Please try again.'
          : '';
      res.render('auth/login', { errorMessage });
    });

    // Handle logout
    router.get('/logout', (req: Request, res: Response) => {
      req.session.destroy((err) => {
        if (err) {
          console.error('Logout error:', err);
          return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    });

    return router;
  },
};

export default authModule;
