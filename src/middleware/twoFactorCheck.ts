import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import prisma from '../db.js';
import { verify } from 'otplib';
import logger from '../services/logger.js';

declare module 'express-session' {
  interface SessionData {
    user: {
      id: number;
      email: string;
      isAdmin: boolean;
      username: string;
      description: string;
    };
    twoFactorVerified?: boolean;
    twoFactorUserId?: number;
  }
}

export async function twoFactorCheck(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.user?.id;

  if (!userId) {
    next(); return;
  }

  try {
    const twoFactor = await prisma.twoFactor.findUnique({
      where: { userId },
    });

    if (!twoFactor?.enabled) {
      next(); return;
    }

    if (req.session.twoFactorVerified) {
      next(); return;
    }

    if (req.path === '/2fa/verify' && req.method === 'GET') {
      next(); return;
    }

    if (req.path === '/2fa/verify' && req.method === 'POST') {
      next(); return;
    }

    req.session.twoFactorUserId = userId;
    res.redirect('/2fa/verify');
  } catch (err: unknown) {
    logger.error('2FA check error:', err);
    next();
  }
}

export function twoFactorVerifyRouter() {
  const router = Router();

  router.get('/2fa/verify', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) {
      res.redirect('/login'); return;
    }

    try {
      const twoFactor = await prisma.twoFactor.findUnique({
        where: { userId },
      });

      if (!twoFactor?.enabled) {
        res.redirect('/'); return;
      }

      if (req.session.twoFactorVerified) {
        res.redirect('/'); return;
      }

      res.render('auth/2fa-verify', { req, error: null });
    } catch (err: unknown) {
      logger.error('Error rendering 2FA verify page:', err);
      res.redirect('/login');
    }
  });

  router.post('/2fa/verify', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    const { code } = req.body as { code: string };

    if (!userId) {
      res.redirect('/login'); return;
    }

    if (!code || typeof code !== 'string') {
      res.render('auth/2fa-verify', { req, error: 'Verification code is required.' });
      return;
    }

    try {
      const twoFactor = await prisma.twoFactor.findUnique({
        where: { userId },
      });

      if (!twoFactor?.enabled) {
        res.redirect('/'); return;
      }

      const result = await verify({ token: code, secret: twoFactor.secret });

      if (!result.valid) {
        res.render('auth/2fa-verify', { req, error: 'Invalid verification code.' });
        return;
      }

      req.session.twoFactorVerified = true;
      res.redirect('/');
    } catch (err: unknown) {
      logger.error('2FA verification error:', err);
      res.render('auth/2fa-verify', { req, error: 'Verification failed.' });
    }
  });

  return router;
}
