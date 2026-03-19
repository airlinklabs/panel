import bcrypt from 'bcrypt';
import prisma from '../../db';
import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import logger from '../../handlers/logger';
import rateLimit from 'express-rate-limit';

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

// Tight rate limit applied only to auth routes — separate from the global limit.
// 10 attempts per minute per IP before they get a 429.
const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a minute.' },
  keyGenerator: (req) => req.ip || 'unknown',
});

async function getSecuritySettings() {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    return {
      maxAttempts:    s?.loginMaxAttempts    ?? 5,
      lockoutMinutes: s?.loginLockoutMinutes ?? 15,
    };
  } catch {
    return { maxAttempts: 5, lockoutMinutes: 15 };
  }
}

const authServiceModule: Module = {
  info: {
    name:          'Auth System Module',
    description:   'Authentication and authorisation for users.',
    version:       '1.0.0',
    moduleVersion: '1.0.0',
    author:        'AirlinkLab',
    license:       'MIT',
  },

  router: () => {
    const router = Router();

    // ── POST /login ─────────────────────────────────────────────────────────
    router.post('/login', authRateLimit, async (req: Request, res: Response) => {
      const { identifier, password } = req.body as { identifier: string; password: string };

      if (!identifier || !password) {
        return res.redirect('/login?err=invalid_credentials');
      }

      try {
        const { maxAttempts, lockoutMinutes } = await getSecuritySettings();

        const user = await prisma.users.findFirst({
          where: { OR: [{ email: identifier }, { username: identifier }] },
        });

        // Always run bcrypt to prevent timing-based user enumeration.
        const hash            = user?.password ?? '$2b$10$' + 'x'.repeat(53);
        const isPasswordValid = await bcrypt.compare(password, hash);

        // Check lockout (only meaningful if the user exists).
        if (user && user.lockedUntil && user.lockedUntil > new Date()) {
          const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
          return res.redirect(`/login?err=account_locked&wait=${minutesLeft}`);
        }

        if (!user || !isPasswordValid) {
          // Increment failed attempt counter on the matching user account.
          if (user) {
            const newAttempts = (user.loginAttempts ?? 0) + 1;
            const shouldLock  = newAttempts >= maxAttempts;
            await prisma.users.update({
              where: { id: user.id },
              data: {
                loginAttempts: newAttempts,
                lockedUntil:   shouldLock
                  ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
                  : null,
              },
            });
          }
          // Single generic error — never reveal whether the username exists.
          return res.redirect('/login?err=invalid_credentials');
        }

        // Successful login: reset counters.
        await prisma.users.update({
          where: { id: user.id },
          data: { loginAttempts: 0, lockedUntil: null },
        });

        req.session.user = {
          id:          user.id,
          email:       user.email,
          isAdmin:     user.isAdmin,
          description: user.description ?? '',
          username:    user.username    ?? '',
        };

        await prisma.loginHistory.create({
          data: {
            userId:    user.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] || null,
          },
        });

        res.redirect('/');
      } catch (error) {
        logger.error('Login error:', error);
        res.redirect('/login?err=invalid_credentials');
      }
    });

    // ── POST /register ───────────────────────────────────────────────────────
    router.post('/register', authRateLimit, async (req: Request, res: Response) => {
      const { email, username, password } = req.body;

      if (!email || !username || !password) {
        return res.redirect('/register?err=missing_credentials');
      }

      const emailRegex    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const usernameRegex = /^[a-zA-Z0-9]{3,20}$/;
      const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

      if (!emailRegex.test(email) || !passwordRegex.test(password)) {
        return res.redirect('/register?err=invalid_input');
      }
      if (!usernameRegex.test(username)) {
        return res.redirect('/register?err=invalid_username');
      }

      try {
        const userCount   = await prisma.users.count();
        const isFirstUser = userCount === 0;

        if (!isFirstUser) {
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          if (!settings?.allowRegistration) {
            return res.redirect('/login?err=registration_disabled');
          }
        }

        const existing = await prisma.users.findFirst({
          where: { OR: [{ email }, { username }] },
        });
        if (existing) return res.redirect('/register?err=user_already_exists');

        await prisma.users.create({
          data: {
            email,
            username,
            password:    await bcrypt.hash(password, 12),
            description: 'No About Me',
            isAdmin:     isFirstUser,
          },
        });

        res.redirect('/login');
      } catch (error) {
        logger.error('Register error:', error);
        res.redirect('/register?err=missing_credentials');
      }
    });

    // ── GET /logout ──────────────────────────────────────────────────────────
    router.get('/logout', (req: Request, res: Response) => {
      res.clearCookie('connect.sid');
      if (req.session) {
        req.session.destroy(() => res.redirect('/login'));
      } else {
        res.redirect('/login');
      }
    });

    return router;
  },
};

export default authServiceModule;
