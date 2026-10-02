import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet } from '../../../handlers/internalApiClient';
import { hasPermission } from '../../../handlers/utils/auth/roles';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Analytics Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/analytics',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          // Effective permissions ride on the request via isAuthenticated.
          // An empty list = unrestricted admin access, mirroring the guard.
          const rawPerms = req.panelUser?.permissions;
          const userPermissions: string[] = Array.isArray(rawPerms)
            ? (rawPerms as unknown as string[])
            : [];
          const showPlayerStats =
            userPermissions.length === 0 ||
            hasPermission(userPermissions, 'airlink.admin.playerstats.view');

          // The two payloads both expose a `servers` key (analytics: summary
          // object, player stats: per-server array), so the player-stats
          // payload is NOT spread — it rides along under `playerStats`.
          // A player-stats failure must not take the whole page down.
          const getJson = (path: string) =>
            apiGet(req, path) as Promise<Record<string, unknown>>;

          const [data, playerStats] = await Promise.all([
            getJson('/admin/analytics'),
            showPlayerStats
              ? getJson('/admin/playerstats').catch(() => ({}))
              : Promise.resolve({}),
          ]);

          res.render('admin/analytics/index', {
            ...data,
            playerStats,
            showPlayerStats,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/analytics/servers',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/analytics');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/analytics/users',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/analytics');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/analytics/network',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/analytics');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/analytics/hardware',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req, res, next) => {
        try {
          const data = await apiGet(req, '/admin/analytics');
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
