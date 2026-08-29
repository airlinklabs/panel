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
import type { Module } from '../../../handlers/moduleInit';
import { apiValidator } from '../../../handlers/utils/api/apiValidator';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';

import serversRouter from './servers';
import filesRouter from './files';
import databasesRouter from './databases';
import backupsRouter from './backups';
import schedulesRouter from './schedules';
import subusersRouter from './subusers';
import startupRouter from './startup';
import accountRouter from './account';
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
    const router = Router();

    // -----------------------------------------------------------------------
    // Server-scoped endpoints: require either API key or session auth.
    //
    // For API key auth: Authorization: Bearer <key>
    // For session auth: standard browser session cookie
    // -----------------------------------------------------------------------
    const serverRoutes = Router();
    serverRoutes.use('/servers', serversRouter);
    serverRoutes.use('/files', filesRouter);
    serverRoutes.use('/databases', databasesRouter);
    serverRoutes.use('/backups', backupsRouter);
    serverRoutes.use('/schedules', schedulesRouter);
    serverRoutes.use('/subusers', subusersRouter);
    serverRoutes.use('/startup', startupRouter);

    // Auth: API key OR session
    serverRoutes.use(async (req, res, next) => {
      const authHeader = req.headers['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        // API key auth
        return apiValidator()(req, res, next);
      }
      // Session auth (browser)
      return isAuthenticated()(req, res, next);
    });

    router.use(serverRoutes);

    // -----------------------------------------------------------------------
    // Account endpoints: session auth only (browser-facing)
    // -----------------------------------------------------------------------
    router.use('/account', isAuthenticated(), accountRouter);

    // -----------------------------------------------------------------------
    // System endpoints: session auth
    // -----------------------------------------------------------------------
    router.use('/system', isAuthenticated(), systemRouter);

    // -----------------------------------------------------------------------
    // Admin endpoints: admin-only session auth
    // -----------------------------------------------------------------------
    router.use('/admin', isAuthenticated(true), adminRouter);

    return router;
  },
};

export default v2Module;
