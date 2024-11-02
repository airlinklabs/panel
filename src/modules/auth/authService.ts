import bcrypt from 'bcrypt';
import session from 'express-session';
import { PrismaClient } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';

const prisma = new PrismaClient();

// Session-Deklaration für Benutzerdaten
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

    // Funktion zur Bearbeitung des Logins
    const handleLogin = async (identifier: string, password: string) => {
      try {
        const user = await prisma.users.findFirst({
          where: { OR: [{ email: identifier }, { username: identifier }] },
        });

        if (!user) {
          return { success: false, error: 'user_not_found' };
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        return isPasswordValid ? { success: true, user } : { success: false, error: 'incorrect_password' };
      } catch (error) {
        console.error('Database error:', error);
        return { success: false, error: 'database_error' };
      }
    };

    // Login-Route
    router.post('/login', async (req: Request, res: Response) => {
      const { identifier, password }: { identifier?: string; password?: string } = req.body;
      if (!identifier || !password) {
        return res.redirect('/login?err=missing_credentials');
      }

      try {
        const result = await handleLogin(identifier, password);
        if (result.success && result.user) {
          req.session.user = {
            id: result.user.id,
            email: result.user.email,
            isAdmin: result.user.isAdmin,
          };
          return res.redirect('/dashboard');
        }
        return res.redirect(`/login?err=${result.error}`);
      } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Server error. Please try again later.');
      }
    });

    // Registrierungs-Route
    router.post('/register', async (req: Request, res: Response) => {
      const { email, username, password } = req.body;

      // Validierung der Eingaben
      if (!email || !username || !password) {
        return res.redirect('/register?err=missing_credentials');
      }

      try {
        const existingUser = await prisma.users.findFirst({
          where: { OR: [{ email }, { username }] },
        });

        if (existingUser) {
          return res.redirect('/register?err=user_already_exists');
        }

        if (!email.includes('@') || !email.includes('.')) {
          return res.redirect('/register?err=invalid_email');
        }

        if (!username.match(/^[a-zA-Z0-9]+$/)) {
          return res.redirect('/register?err=invalid_username');
        }

        await prisma.users.create({
          data: {
            email,
            username,
            password: await bcrypt.hash(password, 10),
          },
        });
        res.redirect('/login');
      } catch (error) {
        console.error('Database error:', error);
        res.status(500).send('Server error. Please try again later.');
      }
    });

    return router;
  },
};

// Prisma-Verbindung bei Beendigung schließen
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default authServiceModule;
