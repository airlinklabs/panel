import bcrypt from 'bcrypt';
import session from 'express-session';
import { PrismaClient } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { Module } from '../handlers/moduleInit';

const prisma = new PrismaClient();
// Extend session interface to include user data
declare module 'express-session' {
  interface SessionData {
    user: {
      id: number;
      email: string;
      isAdmin: boolean;
    };
  }
}

const authServiceModule: Module = {
  info: {
    name: 'Auth System Module',
    description: 'This file is for authentication and authorization of users.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    const handleLogin = async (identifier: string, password: string) => {
      try {
        const user = await prisma.users.findFirst({
          where: {
            OR: [{ email: identifier }, { username: identifier }],
          },
        });

        if (!user) {
          return { success: false, error: 'user_not_found' };
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (isPasswordValid) {
          return { success: true, user };
        }

        return { success: false, error: 'incorrect_password' };
      } catch (error) {
        console.error('Database error:', error);
        return { success: false, error: 'database_error' }; // Return a generic error message
      }
    };

    router.post('/login', (req: Request, res: Response) => {
      const {
        identifier,
        password,
      }: { identifier?: string; password?: string } = req.body;

      // Validate identifier and password
      if (!identifier || !password) {
        return res.redirect('/login?err=missing_credentials');
      }

      // Call handleLogin function and handle Promises
      handleLogin(identifier, password)
        .then((result) => {
          // Check if the login was successful and user is defined
          if (result.success && result.user) {
            req.session.user = {
              id: result.user.id,
              email: result.user.email,
              isAdmin: result.user.isAdmin,
            };
            return res.redirect('/');
          } else if (result.success && !result.user) {
            return res.redirect('/login?err=user_not_found');
          }

          // Redirect with the appropriate error if login failed
          return res.redirect(`/login?err=${result.error}`);
        })
        .catch((error) => {
          console.error('Login error:', error);
          return res.status(500).send('Server error. Please try again later.');
        });
    });

    router.post('/register', async (req: Request, res: Response) => {
      const { email, username, password } = req.body;
      if (!email || !username || !password) {
        return res.redirect('/register?err=missing_credentials');
      }

      prisma.users
        .create({
          data: {
            email,
            username,
            password: await bcrypt.hash(password, 10),
          },
        })
        .then(() => {
          res.redirect('/login');
        })
        .catch((error: any) => {
          console.error('Database error:', error);
          return res.status(500).send('Server error. Please try again later.');
        });
    });

    return router;
  },
};

export default authServiceModule;
