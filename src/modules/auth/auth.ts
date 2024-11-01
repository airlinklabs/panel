import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';

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

    router.get('/register', (req: Request, res: Response) => {
      let errorMessage = '';

      switch (req.query.err) {
        case 'missing_credentials':
          errorMessage = 'Invalid register credentials. Please try again.';
          break;
        case 'user_already_exists':
          errorMessage =
            'User already exists. Please choose another username or email.';
          break;
        case 'invalid_email':
          errorMessage = 'Invalid email format. Please enter a valid email.';
          break;
        case 'invalid_username':
          errorMessage =
            'Invalid username format. Please choose a different username.';
          break;
        default:
          errorMessage = '';
      }

      res.render('auth/register', { errorMessage });
    });

    router.get('/logout', (req: Request, res: Response) => {
      req.session.destroy((err) => {
        if (err) () => {};
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    });

    return router;
  },
};

export default authModule;
