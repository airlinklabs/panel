import { Router } from 'express';
import { getSettings } from '../../../handlers/settingsCache';
import prisma from '../../../db';
import logger from '../../../handlers/logger';
import { logT } from '../../../services/i18n';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Auth Pages',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description:
      'Auth page views — GET routes for login, register, forgot/reset password, 2FA.',
  },
  router: () => {
    const router = Router();

    // ── GET / ──────────────────────────────────────────────────────────────
    // Signed out: the dashboard behind this router is guarded, so bounce to
    // login here. Signed in: fall through so the user dashboard controller
    // (mounted after this router) renders — redirecting would loop.
    router.get('/', (req, res, next) => {
      try {
        if (req.session?.user) {
          next();
          return;
        }
        res.redirect('/login');
      } catch (err) {
        next(err);
      }
    });

    // ── GET /login ─────────────────────────────────────────────────────────
    router.get('/login', async (req, res, next) => {
      try {
        if (req.session?.user) {
          res.redirect('/');
          return;
        }

        const settings = await getSettings();
        const userCount = await prisma.users.count();

        if (userCount === 0) {
          res.redirect('/register');
          return;
        }

        res.render('auth/login', { req, settings });
      } catch (error) {
        logger.error(logT('log.authErrorRenderingLogin'), error);
        res.status(500).render('auth/login', { req, settings: null });
      }
    });

    // ── GET /register ──────────────────────────────────────────────────────
    router.get('/register', async (req, res, next) => {
      try {
        if (req.session?.user) {
          res.redirect('/');
          return;
        }

        const settings = await getSettings();
        const userCount = await prisma.users.count();
        const isFirstUser = userCount === 0;

        if (!isFirstUser && settings && !settings.allowRegistration) {
          res.redirect('/login?err=registration_disabled');
          return;
        }

        res.render('auth/register', { req, settings });
      } catch (error) {
        logger.error(logT('log.authErrorRenderingRegister'), error);
        res.status(500).render('auth/register', { req, settings: null });
      }
    });

    // ── GET /forgot-password ───────────────────────────────────────────────
    router.get('/forgot-password', async (req, res, next) => {
      try {
        if (req.session?.user) {
          res.redirect('/');
          return;
        }

        const settings = await getSettings();
        res.render('auth/forgot-password', { req, settings });
      } catch (error) {
        logger.error(logT('log.authErrorRenderingForgotPassword'), error);
        res.status(500).render('auth/forgot-password', { req, settings: null });
      }
    });

    // ── GET /reset-password ────────────────────────────────────────────────
    router.get('/reset-password', async (req, res, next) => {
      try {
        if (req.session?.user) {
          res.redirect('/');
          return;
        }

        const { token } = req.query as { token?: string };
        const settings = await getSettings();

        let validToken = false;
        if (token) {
          try {
            const record = await prisma.passwordReset.findUnique({
              where: { token },
            });
            validToken =
              !!record && !record.used && record.expiresAt > new Date();
          } catch (error) {
            logger.error(logT('log.authResetTokenLookupError'), error);
          }
        }

        res.render('auth/reset-password', {
          req,
          settings,
          token: validToken ? token : null,
          invalidToken: !validToken,
        });
      } catch (error) {
        logger.error(logT('log.authErrorRenderingResetPassword'), error);
        res.status(500).render('auth/reset-password', {
          req,
          settings: null,
          token: null,
          invalidToken: true,
        });
      }
    });

    // ── GET /check-username ────────────────────────────────────────────────
    router.get('/check-username', async (req, res, next) => {
      try {
        const { username } = req.query as { username?: string };

        if (!username || typeof username !== 'string') {
          res.json({ available: false });
          return;
        }

        const exists = await prisma.users.findFirst({
          where: { username: username.trim() },
          select: { id: true },
        });

        res.json({ available: !exists });
      } catch (error) {
        logger.error(logT('log.authCheckUsernameError'), error);
        res.json({ available: false });
      }
    });

    return router;
  },
};

export default module;
