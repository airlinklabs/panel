import { getSettings } from '../../handlers/settingsCache';
import bcrypt from 'bcryptjs';
import prisma from '../../db';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import logger from '../../handlers/logger';
import rateLimit from 'express-rate-limit';
import { getClientIp } from '../../utils/ip';
import {
  loginSchema,
  registerSchema,
  authValidationErrorCode,
} from './schemas';

const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a minute.' },
  keyGenerator: (req) => getClientIp(req),
  validate: false,
});

async function getSecuritySettings() {
  try {
    const s = await getSettings();
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
    version:          '2.0.0',
    moduleVersion: '2.0.0',
    author:        'AirLinkLab',
    license:       'MIT',
  },

  router: () => {
    const router = Router();

    router.post('/login', authRateLimit, async (req: Request, res: Response) => {
      const parsed = loginSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.redirect('/login?err=invalid_credentials');
      }

      const { identifier, password, 'remember-me': rememberMe } = parsed.data;

      try {
        const { maxAttempts, lockoutMinutes } = await getSecuritySettings();

        const user = await prisma.users.findFirst({
          where: { OR: [{ email: identifier }, { username: identifier }] },
        });

        const hash            = user?.password ?? `$2b$10$${  'x'.repeat(53)}`;
        const isPasswordValid = await bcrypt.compare(password, hash);

        if (user && user.lockedUntil && user.lockedUntil > new Date()) {
          const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
          return res.redirect(`/login?err=account_locked&wait=${minutesLeft}`);
        }

        if (!user || !isPasswordValid) {
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
          return res.redirect('/login?err=invalid_credentials');
        }

        await prisma.users.update({
          where: { id: user.id },
          data: { loginAttempts: 0, lockedUntil: null },
        });

        await new Promise<void>((resolve, reject) =>
          req.session.regenerate(err => (err ? reject(err) : resolve()))
        );

        req.session.cookie.maxAge = rememberMe
          ? 30 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

        if (user.totpEnabled) {
          req.session.pendingUserId = user.id;
          res.redirect('/2fa');
          return;
        }

        req.session.user = {
          id:          user.id,
          email:       user.email,
          isAdmin:     user.isAdmin,
          description: user.description ?? '',
          username:    user.username    ?? '',
          role:        user.role,
          onboardingCompleted: user.onboardingCompleted,
          onboardingSkipped:   user.onboardingSkipped,
        };

        await prisma.loginHistory.create({
          data: {
            userId:    user.id,
            ipAddress: getClientIp(req),
            userAgent: req.headers['user-agent'] || null,
          },
        });

        res.redirect('/');
      } catch (error) {
        logger.error('Login error:', error);
        res.redirect('/login?err=invalid_credentials');
      }
    });

    router.post('/register', authRateLimit, async (req: Request, res: Response) => {
      const parsed = registerSchema.safeParse(req.body);

      if (!parsed.success) {
        const code = authValidationErrorCode(parsed.error.issues);
        if (code === 'missing') return res.redirect('/register?err=missing_credentials');
        if (code === 'invalid_username') return res.redirect('/register?err=invalid_username');
        return res.redirect('/register?err=invalid_input');
      }

      const { email, username, password } = parsed.data;

      try {
        const passwordHash = await bcrypt.hash(password, 12);

        await prisma.$transaction(async (tx) => {
          const [lock] = await tx.$queryRaw<Array<{ acquired: number }>>`
            SELECT GET_LOCK('airlink:first-user-bootstrap', 10) AS acquired
          `;
          if (lock?.acquired !== 1) throw new Error('bootstrap_lock_timeout');

          try {
            const userCount = await tx.users.count();
            const isFirstUser = userCount === 0;

            if (!isFirstUser) {
              const settings = await getSettings();
              if (!settings?.allowRegistration) throw new Error('registration_disabled');
            }

            const existing = await tx.users.findFirst({
              where: { OR: [{ email }, { username }] },
            });
            if (existing) throw new Error('user_already_exists');

            await tx.users.create({
              data: {
                email,
                username,
                password: passwordHash,
                description: 'No About Me',
                role: isFirstUser ? 'owner' : 'user',
                isAdmin: isFirstUser,
              },
            });
          } finally {
            await tx.$queryRaw`SELECT RELEASE_LOCK('airlink:first-user-bootstrap')`;
          }
        });

        res.redirect('/login');
      } catch (error) {
        logger.error('Register error:', error);
        res.redirect('/register?err=missing_credentials');
      }
    });

    router.get('/logout', (req: Request, res: Response) => {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) logger.error('Session destruction error', err);
          res.clearCookie('connect.sid');
          res.redirect('/login');
        });
      } else {
        res.clearCookie('connect.sid');
        res.redirect('/login');
      }
    });

    return router;
  },
};

export default authServiceModule;
