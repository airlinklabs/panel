import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../middleware/auth';
import otplib from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import logger from '../../services/logger';

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString('hex'));
  }
  return codes;
}

async function hashBackupCodes(codes: string[]): Promise<string> {
  const hashed = await Promise.all(codes.map(code => bcrypt.hash(code, 10)));
  return JSON.stringify(hashed);
}

const twoFactorModule: Module = {
  info: {
    name: 'Two-Factor Authentication Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/account/2fa',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        try {
          const twoFactor = await prisma.twoFactor.findUnique({
            where: { userId },
          });

          res.render('user/account-2fa', {
            req,
            twoFactor,
            enabled: twoFactor?.enabled ?? false,
          });
        } catch (err: unknown) {
          logger.error('Error fetching 2FA status:', err);
          res.redirect('/account');
        }
      },
    );

    router.post(
      '/account/2fa/enable',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        try {
          const existing = await prisma.twoFactor.findUnique({
            where: { userId },
          });

          if (existing?.enabled) {
            res.status(400).json({ error: '2FA is already enabled.' });
            return;
          }

          const user = await prisma.users.findUnique({ where: { id: userId } });
          const secret = otplib.generateSecret();
          const otpauth = otplib.generateURI({
            secret,
            issuer: 'AirLink Panel',
            label: user?.email ?? '',
          });

          const qrDataUrl = await QRCode.toDataURL(otpauth);

          if (existing) {
            await prisma.twoFactor.update({
              where: { userId },
              data: { secret, enabled: false },
            });
          } else {
            await prisma.twoFactor.create({
              data: { userId: userId!, secret, enabled: false },
            });
          }

          res.json({ qrCode: qrDataUrl, secret });
        } catch (err: unknown) {
          logger.error('Error generating 2FA secret:', err);
          res.status(500).json({ error: 'Failed to enable 2FA.' });
        }
      },
    );

    router.post(
      '/account/2fa/verify',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const { code } = req.body as { code: string };

        if (!code || typeof code !== 'string') {
          res.status(400).json({ error: 'Verification code is required.' });
          return;
        }

        try {
          const twoFactor = await prisma.twoFactor.findUnique({
            where: { userId },
          });

          if (!twoFactor) {
            res.status(400).json({ error: '2FA setup not initiated.' });
            return;
          }

          const result = await otplib.verify({ token: code, secret: twoFactor.secret });

          if (!result.valid) {
            res.status(400).json({ error: 'Invalid verification code.' });
            return;
          }

          await prisma.twoFactor.update({
            where: { userId },
            data: { enabled: true },
          });

          res.json({ message: '2FA enabled successfully.' });
        } catch (err: unknown) {
          logger.error('Error verifying 2FA code:', err);
          res.status(500).json({ error: 'Failed to verify code.' });
        }
      },
    );

    router.post(
      '/account/2fa/disable',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const { password } = req.body as { password: string };

        if (!password) {
          res.status(400).json({ error: 'Password is required to disable 2FA.' });
          return;
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found.' });
            return;
          }

          const passwordMatch = await bcrypt.compare(password, user.password);
          if (!passwordMatch) {
            res.status(401).json({ error: 'Incorrect password.' });
            return;
          }

          const twoFactor = await prisma.twoFactor.findUnique({
            where: { userId },
          });

          if (!twoFactor?.enabled) {
            res.status(400).json({ error: '2FA is not enabled.' });
            return;
          }

          await prisma.twoFactor.delete({ where: { userId } });

          res.json({ message: '2FA disabled successfully.' });
        } catch (err: unknown) {
          logger.error('Error disabling 2FA:', err);
          res.status(500).json({ error: 'Failed to disable 2FA.' });
        }
      },
    );

    router.get(
      '/account/2fa/backup-codes',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        try {
          const twoFactor = await prisma.twoFactor.findUnique({
            where: { userId },
          });

          if (!twoFactor?.enabled) {
            res.status(400).json({ error: '2FA must be enabled to generate backup codes.' });
            return;
          }

          const codes = generateBackupCodes();
          const hashed = await hashBackupCodes(codes);

          await prisma.twoFactor.update({
            where: { userId },
            data: { backupCodes: hashed },
          });

          res.json({ codes });
        } catch (err: unknown) {
          logger.error('Error generating backup codes:', err);
          res.status(500).json({ error: 'Failed to generate backup codes.' });
        }
      },
    );

    return router;
  },
};

export default twoFactorModule;
