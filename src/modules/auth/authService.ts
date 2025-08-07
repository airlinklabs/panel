import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

declare module 'express-session' {
  interface SessionData {
    user: {
      id: number;
      email: string;
      isAdmin: boolean;
      username: string;
      description: string;
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
          where: { OR: [{ email: identifier }, { username: identifier }] },
        });

        const hash = user?.password ?? '$2b$10$' + 'x'.repeat(53);
        const isPasswordValid = await bcrypt.compare(password, hash);

        if (!user || !isPasswordValid) {
          return { success: false, error: 'invalid_credentials' };
        }

        return { success: true, user };
      } catch (error) {
        logger.error('Database error:', error);
        return { success: false, error: 'internal_error' };
      }
    };

    router.post('/login', async (req: Request, res: Response) => {
      const { identifier, password }: { identifier: string; password: string } =
        req.body;

      if (!identifier || !password) {
        return res.redirect('/login?err=missing_credentials');
      }

      try {
        const result = await handleLogin(identifier, password);
        if (result.success && result.user) {
          if (result.user.username && result.user.description) {
            req.session.user = {
              id: result.user.id,
              email: result.user.email,
              isAdmin: result.user.isAdmin,
              description: result.user.description,
              username: result.user.username,
            };
          }
          
          await prisma.loginHistory.create({
            data: {
              userId: result.user.id,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] || null
            }
          });
          
          res.redirect('/');
          return;
        }
        res.redirect('/login?err=invalid_credentials');
        return;
      } catch (error) {
        logger.error('Login error:', error);
        res.status(500).send('Server error. Please try again later.');
      }
    });

    router.post('/register', async (req: Request, res: Response) => {
      const { email, username, password } = req.body;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const usernameRegex = /^[a-zA-Z0-9]{3,20}$/;
      const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

      if (!email || !username || !password) {
        res.redirect('/register?err=missing_credentials');
        return;
      }

      if (!emailRegex.test(email) || !passwordRegex.test(password)) {
        return res.redirect('/register?err=invalid_input');
      }

      if (!usernameRegex.test(username)) {
        res.redirect('/register?err=invalid_username');
        return;
      }

      try {
        const existingUser = await prisma.users.findFirst({
          where: { OR: [{ email }, { username }] },
        });

        if (existingUser) {
          res.redirect('/register?err=user_already_exists');
          return;
        }

        const userCount = await prisma.users.count();
        const isFirstUser = userCount === 0;

        // Check if registration is allowed
        if (!isFirstUser) {
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          if (!settings || !(settings as any).allowRegistration) {
            res.redirect('/login?err=registration_disabled');
            return;
          }
        }

        await prisma.users.create({
          data: {
            email,
            username,
            password: await bcrypt.hash(password, 10),
            description: 'No About Me',
            isAdmin: isFirstUser,
          },
        });
        res.redirect('/login');
      } catch (error) {
        logger.error('Database error:', error);
        res.status(500).send('Server error. Please try again later.');
      }
    });

    router.get('/logout', (req: Request, res: Response) => {
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

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default authServiceModule;
