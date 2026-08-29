import { getSettings } from '../../handlers/settingsCache';
import type { Request, Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import logger from '../../handlers/logger';
import { sendPasswordReset } from '../../handlers/utils/core/mailer';
import { getClientIp } from '../../utils/ip';

// 3 requests per hour per IP — enough for a legitimate user, too few for abuse.
const forgotRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  validate: false,
  handler: (req: Request, res: Response) => {
    res.redirect('/forgot-password?err=rate_limited');
  },
});

// Per-IP limit on POST /reset-password. A reset token is 64 hex chars, so
// brute-force is infeasible, but the endpoint shouldn't be openly hammerable
// (token-enumeration / DoS defense). Returns 429 JSON rather than redirecting
// so API callers get a machine-readable response.
const resetRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  validate: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
  },
});

const passwordResetModule: Module = {
  info: {
    name: 'Password Reset Module',
    description: 'Forgot password flow with email delivery and secure tokens.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // ── GET /forgot-password ────────────────────────────────────────────────
    router.get('/forgot-password', async (req: Request, res: Response) => {
      const settings = await getSettings();
      res.render('auth/forgot-password', { req, settings });
    });

    // ── POST /forgot-password ───────────────────────────────────────────────
    // Always responds the same way — never reveals whether the email exists.
    router.post('/forgot-password', forgotRateLimit, async (req: Request, res: Response) => {
      const { email } = req.body as { email?: string };

      if (typeof email === 'string' && email.trim() !== '') {
        try {
          const user = await prisma.users.findUnique({
            where: { email: email.trim().toLowerCase() },
          });

          if (user) {
            const token = crypto.randomBytes(32).toString('hex');

            await prisma.passwordReset.create({
              data: {
                userId: user.id,
                token,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
              },
            });

            const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;

            await sendPasswordReset({
              to: user.email,
              panelName: process.env.NAME || 'Airlink',
              resetUrl,
            });
          }
        } catch (error) {
          logger.error('Password reset request error:', error);
        }
      }

      res.redirect('/login?err=reset_email_sent');
    });

    // ── GET /reset-password ─────────────────────────────────────────────────
    router.get('/reset-password', async (req: Request, res: Response) => {
      const { token } = req.query as { token?: string };
      const settings = await getSettings();

      let validToken = false;
      if (token) {
        try {
          const record = await prisma.passwordReset.findUnique({ where: { token } });
          validToken = !!record && !record.used && record.expiresAt > new Date();
        } catch (error) {
          logger.error('Reset token lookup error:', error);
        }
      }

      res.render('auth/reset-password', {
        req,
        settings,
        token: validToken ? token : null,
        invalidToken: !validToken,
      });
    });

    // ── POST /reset-password ────────────────────────────────────────────────
    router.post('/reset-password', resetRateLimit, async (req: Request, res: Response) => {
      const { token, password, confirmPassword } = req.body as {
        token?: string;
        password?: string;
        confirmPassword?: string;
      };

      const back = (err: string) =>
        res.redirect(`/reset-password?token=${encodeURIComponent(token ?? '')}&err=${err}`);

      if (!token || !password || !confirmPassword) {
        return back('missing');
      }

      if (password !== confirmPassword) {
        return back('mismatch');
      }

      const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(password)) {
        return back('weak');
      }

      try {
        const record = await prisma.passwordReset.findUnique({ where: { token } });

        if (!record || record.used || record.expiresAt <= new Date()) {
          return res.redirect('/reset-password?err=expired');
        }

        await prisma.users.update({
          where: { id: record.userId },
          data: {
            password: await bcrypt.hash(password, 12),
            loginAttempts: 0,
            lockedUntil: null,
          },
        });

        await prisma.passwordReset.update({
          where: { id: record.id },
          data: { used: true },
        });

        res.redirect('/login?err=password_reset');
      } catch (error) {
        logger.error('Password reset error:', error);
        return back('error');
      }
    });

    return router;
  },
};

export default passwordResetModule;
