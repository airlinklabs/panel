import { Router } from 'express';
import {
  isAuthenticatedForServer,
  requireSubUserPermission,
} from '../../../../handlers/utils/auth/serverAuthUtil';
import { apiGet } from '../../../../handlers/internalApiClient';
import type { Module } from '../../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'User Server Logs',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: 'Log viewer for user servers',
  },
  router: () => {
    const router = Router();

    // ── Log viewer page ──────────────────────────────────────────────────
    router.get(
      '/server/:id/logs',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('console'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(
            req,
            `/servers/${req.params.id}`,
          )) as Record<string, unknown>;
          res.render('user/server/logs', {
            ...data,
            server: data,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Log history (JSON) ───────────────────────────────────────────────
    router.get(
      '/server/:id/logs/history',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('console'),
      async (req, res, next) => {
        try {
          const data = await apiGet(
            req,
            `/servers/${req.params.id}/logs/history`,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Log archives list (JSON) ─────────────────────────────────────────
    router.get(
      '/server/:id/logs/archives',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('console'),
      async (req, res, next) => {
        try {
          const data = await apiGet(
            req,
            `/servers/${req.params.id}/logs/archives`,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Read log archive (JSON) ──────────────────────────────────────────
    router.get(
      '/server/:id/logs/archives/read',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('console'),
      async (req, res, next) => {
        try {
          const file = req.query.file as string;
          const data = await apiGet(
            req,
            `/servers/${req.params.id}/logs/archives/read?file=${encodeURIComponent(file || '')}`,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Download log archive ─────────────────────────────────────────────
    router.get(
      '/server/:id/logs/archives/download',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('console'),
      async (req, res, next) => {
        try {
          const file = req.query.file as string;
          const data = (await apiGet(
            req,
            `/servers/${req.params.id}/logs/archives/download?file=${encodeURIComponent(file || '')}`,
          )) as { url?: string };
          // `<a href>` download — redirect to the daemon URL, not JSON.
          res.redirect(data.url || '/');
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
