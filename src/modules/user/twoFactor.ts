import { Router, Request, Response } from 'express';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import logger from '../../handlers/logger';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getClientIp } from '../../utils/ip';

declare module 'express-session' {
  interface SessionData {
    pendingUserId?: number;
    pendingTotpSecret?: string;
  }
}

const TOTP_ISSUER = 'Airlink';

function createTotp(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

function normalizeToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const clean = token.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(clean) ? clean : null;
}

const twoFactorModule: Module = {
  info: {
    name: 'Two-Factor Authentication Module',
    description: 'TOTP-based two-factor authentication for user accounts.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirlinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // ── GET /account/2fa/setup ─────────────────────────────────────────────
    // Generates a fresh TOTP secret and shows the QR code for scanning.
    router.get(
      '/account/2fa/setup',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');

          if (user.totpEnabled) return res.redirect('/account');

          const secret = new OTPAuth.Secret({ size: 20 });
          const secretBase32 = secret.base32;
          req.session.pendingTotpSecret = secretBase32;

          const totp = createTotp(secretBase32, user.email);
          const otpauthUrl = totp.toString();
          const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 1 });

          res.render('user/2fa-setup', {
            user,
            req,
            settings,
            qrDataUrl,
            secretBase32: secretBase32.match(/.{1,4}/g)?.join(' ') ?? secretBase32,
          });
        } catch (error) {
          logger.error('2FA setup error:', error);
          res.redirect('/account');
        }
      },
    );

    // ── POST /account/2fa/enable ────────────────────────────────────────────
    router.post(
      '/account/2fa/enable',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { token } = req.body as { token?: unknown };
        const userId = req.session?.user?.id;
        const pendingSecret = req.session.pendingTotpSecret;

        if (!pendingSecret) {
          return res.status(400).json({ error: 'No pending 2FA secret. Start setup again.' });
        }

        const cleanToken = normalizeToken(token);
        if (!cleanToken) {
          return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.status(404).json({ error: 'User not found.' });
          if (user.totpEnabled) return res.status(400).json({ error: 'Two-factor authentication is already enabled.' });

          const totp = createTotp(pendingSecret, user.email);
          if (totp.validate({ token: cleanToken, window: 1 }) === null) {
            return res.status(400).json({ error: 'Invalid code. Try again.' });
          }

          await prisma.users.update({
            where: { id: user.id },
            data: { totpSecret: pendingSecret, totpEnabled: true },
          });

          delete req.session.pendingTotpSecret;
          res.json({ success: true, message: 'Two-factor authentication enabled.' });
          return;
        } catch (error) {
          logger.error('2FA enable error:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      },
    );

    // ── POST /account/2fa/disable ───────────────────────────────────────────
    router.post(
      '/account/2fa/disable',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { password } = req.body as { password?: string };
        const userId = req.session?.user?.id;

        if (!password) {
          return res.status(400).json({ error: 'Current password is required.' });
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.status(404).json({ error: 'User not found.' });

          const passwordMatch = await bcrypt.compare(password, user.password);
          if (!passwordMatch) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
          }

          await prisma.users.update({
            where: { id: user.id },
            data: { totpSecret: null, totpEnabled: false },
          });

          res.json({ success: true, message: 'Two-factor authentication disabled.' });
          return;
        } catch (error) {
          logger.error('2FA disable error:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      },
    );

    // ── GET /2fa ────────────────────────────────────────────────────────────
    // Shown after a successful password login when the account has 2FA enabled.
    router.get('/2fa', async (req: Request, res: Response) => {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });

      if (!req.session.pendingUserId) {
        return res.redirect('/login');
      }

      res.render('auth/2fa-verify', { req, settings });
    });

    // ── POST /2fa ───────────────────────────────────────────────────────────
    router.post('/2fa', async (req: Request, res: Response) => {
      const { token } = req.body as { token?: unknown };
      const pendingUserId = req.session.pendingUserId;

      if (!pendingUserId) {
        return res.status(400).json({ error: 'No login in progress. Sign in again.' });
      }

      const cleanToken = normalizeToken(token);
      if (!cleanToken) {
        return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: pendingUserId } });
        if (!user || !user.totpEnabled || !user.totpSecret) {
          return res.status(400).json({ error: 'No login in progress. Sign in again.' });
        }

        const totp = createTotp(user.totpSecret, user.email);
        if (totp.validate({ token: cleanToken, window: 1 }) === null) {
          return res.status(400).json({ error: 'Invalid code. Try again.' });
        }

        await new Promise<void>((resolve, reject) =>
          req.session.regenerate(err => (err ? reject(err) : resolve()))
        );

        req.session.user = {
          id: user.id,
          email: user.email,
          isAdmin: user.isAdmin,
          description: user.description ?? '',
          username: user.username ?? '',
        };

        await prisma.loginHistory.create({
          data: {
            userId: user.id,
            ipAddress: getClientIp(req),
            userAgent: req.headers['user-agent'] || null,
          },
        });

        res.json({ success: true, redirect: '/' });
        return;
      } catch (error) {
        logger.error('2FA verify error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }
    });

    return router;
  },
};

export default twoFactorModule;
