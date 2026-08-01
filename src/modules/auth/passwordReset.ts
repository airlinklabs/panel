import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import logger from '../../handlers/logger';
import { sendMail } from '../../handlers/utils/core/mailer';
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
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
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

            await sendMail(
              user.email,
              'Password reset request',
              `
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e5e5;border-radius:12px">
                  <h2 style="margin-top:0;color:#171717">Password reset</h2>
                  <p style="color:#525252">A password reset was requested for your account on ${process.env.NAME || 'Airlink'}. This link expires in 1 hour.</p>
                  <p style="margin:24px 0">
                    <a href="${resetUrl}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:600">Reset password</a>
                  </p>
                  <p style="color:#a3a3a3;font-size:12px">If you did not request this, you can safely ignore this email.</p>
                </div>
              `,
            );
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
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });

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
    router.post('/reset-password', async (req: Request, res: Response) => {
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
