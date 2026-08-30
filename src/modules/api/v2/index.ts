/**
 * V2 API — Main router.
 *
 * Mounts all V2 endpoint groups under /api/v2.
 *
 * Endpoints:
 *   /api/v2/servers    — Server management (list, get, update, delete, power, reinstall, status)
 *   /api/v2/files      — File operations (list, read, write, delete, rename, mkdir, copy, zip, unzip, pull)
 *   /api/v2/databases  — Database operations (list, create, delete, rotate password)
 *   /api/v2/backups    — Backup operations (list, create, delete, restore, lock, download, progress)
 *   /api/v2/schedules  — Schedule operations (CRUD, tasks, run)
 *   /api/v2/subusers   — Sub-user management (list, add, update, remove)
 *   /api/v2/startup    — Startup config (get, command, docker image, variables)
 *   /api/v2/account    — User account (profile, username, email, password, avatar, 2FA)
 *   /api/v2/admin/*    — Admin operations (nodes, users, servers, settings, databases, images, etc.)
 *   /api/v2/system     — System status, health, test node
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Module } from '../../../handlers/moduleInit';
import { apiValidator } from '../../../handlers/utils/api/apiValidator';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { redisRateLimit } from '../../../handlers/utils/security/redisRateLimit';
import type { ApiCapability } from './helpers';

import serversRouter from './servers';
import filesRouter from './files';
import databasesRouter from './databases';
import backupsRouter from './backups';
import schedulesRouter from './schedules';
import subusersRouter from './subusers';
import startupRouter from './startup';
import accountRouter from './account';
import passkeyRouter from './passkey';
import systemRouter from './system';
import adminRouter from './admin';

const v2Module: Module = {
  info: {
    name: 'V2 API Module',
    description: 'RESTful API v2 for Airlink panel',
    version: '2.0.0',
    moduleVersion: '2.0.0',
    author: 'AirlinkLabs',
    license: 'MIT',
  },
  router: () => {
    // Outer router — mounted at root by the module loader. All V2 endpoints
    // live under the /api/v2 prefix to avoid colliding with page routes
    // (/account, /admin/*, /servers, etc.) that share the same paths.
    const router = Router();
    const v2 = Router();

    // -----------------------------------------------------------------------
    // Server-scoped endpoints: require either API key or session auth.
    //
    // For API key auth: Authorization: Bearer <key>
    // For session auth: standard browser session cookie
    //
    // When a requiredCapability is provided, API keys must have that scope.
    // Session users bypass capability checks (full access if authenticated).
    //
    // Auth is applied per-sub-router, NOT as a catch-all. A catch-all on a
    // root-mounted router would intercept every request (e.g. /login,
    // /register) that doesn't match a sub-route prefix, causing an infinite
    // redirect loop when unauthenticated.
    // -----------------------------------------------------------------------
    const apiKeyOrSessionAuth =
      (requiredCapability?: ApiCapability) =>
        async (req: Request, res: Response, next: NextFunction) => {
          const authHeader = req.headers['authorization'];
          if (authHeader?.startsWith('Bearer ')) {
            return apiValidator(requiredCapability)(req, res, next);
          }
          return isAuthenticated()(req, res, next);
        };

    v2.use(
      '/servers',
      apiKeyOrSessionAuth('servers.*'),
      redisRateLimit,
      serversRouter,
    );
    v2.use(
      '/files',
      apiKeyOrSessionAuth('files.*'),
      redisRateLimit,
      filesRouter,
    );
    v2.use(
      '/databases',
      apiKeyOrSessionAuth('databases.*'),
      redisRateLimit,
      databasesRouter,
    );
    v2.use(
      '/backups',
      apiKeyOrSessionAuth('backups.*'),
      redisRateLimit,
      backupsRouter,
    );
    v2.use(
      '/schedules',
      apiKeyOrSessionAuth('schedules.*'),
      redisRateLimit,
      schedulesRouter,
    );
    v2.use(
      '/subusers',
      apiKeyOrSessionAuth('subusers.*'),
      redisRateLimit,
      subusersRouter,
    );
    v2.use(
      '/startup',
      apiKeyOrSessionAuth('startup.*'),
      redisRateLimit,
      startupRouter,
    );

    // -----------------------------------------------------------------------
    // Account endpoints: session auth only (browser-facing)
    // -----------------------------------------------------------------------
    v2.use('/account', isAuthenticated(), accountRouter);

    // -----------------------------------------------------------------------
    // Passkey endpoints: two sub-groups —
    //   /api/v2/account/passkey/*  — authenticated (list, delete, register)
    //   /api/v2/passkey/auth/*     — pending session (auth verify during login)
    // -----------------------------------------------------------------------
    v2.use('/account/passkey', isAuthenticated(), passkeyRouter);
    v2.use('/passkey', passkeyRouter);

    // -----------------------------------------------------------------------
    // System endpoints: session auth
    // -----------------------------------------------------------------------
    v2.use('/system', isAuthenticated(), systemRouter);

    // -----------------------------------------------------------------------
    // Admin endpoints: admin-only session auth
    // -----------------------------------------------------------------------
    v2.use('/admin', isAuthenticated(true), adminRouter);

    // Scope everything under /api/v2 so page routes (/account, /admin/*, etc.)
    // are not shadowed by API endpoints.
    router.use('/api/v2', v2);

    return router;
  },
};

export default v2Module;
