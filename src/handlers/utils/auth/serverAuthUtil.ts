import type { Request, Response, NextFunction } from 'express';
import type { WebSocket } from 'ws';

import logger from '../../logger';
import prisma from '../../../db';
import { getParamAsString } from '../../../utils/typeHelpers';
import { renderErrorPage } from '../../errorPages';
import { parsePermissions, subUserHasPermission } from './authorization';
import { getImageFeaturesOrNull } from '../../imageFeatures';
import { logT } from '../../../services/i18n';

export const SUBUSER_PERMISSIONS = [
  'websocket.connect',
  'console',
  'console.send',
  'control.start',
  'control.stop',
  'control.restart',
  'control.console',
  'files',
  'files.read',
  'files.write',
  'files.delete',
  'files.sftp',
  'files.pull',
  'files.archive',
  'files.create',
  'files.update',
  'startup',
  'startup.read',
  'startup.update',
  'startup.docker-image',
  'backups',
  'backups.read',
  'backups.create',
  'backups.delete',
  'backups.download',
  'backups.restore',
  'backups.lock',
  'database.create',
  'database.read',
  'database.update',
  'database.delete',
  'database.view_password',
  'schedule.create',
  'schedule.read',
  'schedule.update',
  'schedule.delete',
  'allocation.read',
  'allocation.create',
  'allocation.update',
  'allocation.delete',
  'settings',
  'settings.update',
  'settings.rename',
  'settings.reinstall',
  'activity.read',
] as const;

export type SubUserPermission = (typeof SUBUSER_PERMISSIONS)[number];

// Logical groups for the subuser permission UI.
export const PERMISSION_GROUPS: {
  title: string;
  perms: SubUserPermission[];
}[] = [
  {
    title: 'Console control',
    perms: [
      'console',
      'console.send',
      'control.start',
      'control.stop',
      'control.restart',
      'control.console',
      'websocket.connect',
    ],
  },
  {
    title: 'Files',
    perms: [
      'files',
      'files.read',
      'files.write',
      'files.delete',
      'files.sftp',
      'files.pull',
      'files.archive',
      'files.create',
      'files.update',
    ],
  },
  {
    title: 'Startup',
    perms: [
      'startup',
      'startup.read',
      'startup.update',
      'startup.docker-image',
    ],
  },
  {
    title: 'Backups',
    perms: [
      'backups',
      'backups.read',
      'backups.create',
      'backups.delete',
      'backups.download',
      'backups.restore',
      'backups.lock',
    ],
  },
  {
    title: 'Databases',
    perms: [
      'database.create',
      'database.read',
      'database.update',
      'database.delete',
      'database.view_password',
    ],
  },
  {
    title: 'Schedules',
    perms: [
      'schedule.create',
      'schedule.read',
      'schedule.update',
      'schedule.delete',
    ],
  },
  {
    title: 'Allocations',
    perms: [
      'allocation.read',
      'allocation.create',
      'allocation.update',
      'allocation.delete',
    ],
  },
  {
    title: 'Settings & Activity',
    perms: [
      'settings',
      'settings.update',
      'settings.rename',
      'settings.reinstall',
      'activity.read',
    ],
  },
];

// Re-export from shared authorization module for backwards compatibility
export { parsePermissions as parseSubUserPermissions, subUserHasPermission };

async function findSubUser(serverId: string, userId: number) {
  return prisma.subUser.findUnique({
    where: { serverId_userId: { serverId, userId } },
  });
}

/**
 * Publish the image's declared feature allow-list as `res.locals.navFeatures`.
 *
 * `string[]` = the image declared an allow-list, use it to filter the
 * feature-gated nav entries (`players`, `worlds`). `null` = undeclared — the
 * image publishes no `features` at all — and the nav must then show everything.
 *
 * Deliberately *not* the `features` render local: `res.render(view, { ...data })`
 * spreads API bodies that already carry their own `features`
 * (`src/modules/api/v2/startup.ts`), which would silently override it with `[]`.
 * A name no API returns — `navFeatures` — is set once here and cannot collide.
 * The rewritten page controllers under `src/modules/pages/**` never pass
 * `features` at all, which is why the sidebar lost Players/Worlds on every page
 * they own (instructions.md §15.3 F2).
 */
function setNavFeatures(
  res: Response,
  server: { image?: { info?: string | null } | null } | null,
): void {
  // Express always provides `res.locals`, but guard anyway: a fixture without
  // it must not turn a navigation decision into an authentication failure.
  if (!res.locals) {
    return;
  }
  try {
    res.locals.navFeatures = server
      ? getImageFeaturesOrNull(server.image)
      : null;
  } catch (error) {
    logger.error(logT('log.authServerMiddlewareError'), error);
    // Fail open: an unresolvable image must not hide nav entries.
    res.locals.navFeatures = null;
  }
}

export const isAuthenticatedForServer =
  (serverIdParam = 'id') =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const userId = req.session?.user?.id;

      if (!userId) {
        res.redirect('/login');
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });

        if (!user) {
          res.redirect('/login');
          return;
        }

        // One query that both authorizes and resolves the nav's feature
        // allow-list. It runs *before* the admin short-circuit because admins
        // skip the ownership check below and would otherwise never get
        // `navFeatures` — they are the account most likely to have declared a
        // feature list to begin with. Costs admins one lookup it did not
        // previously make, and costs everyone else nothing (this replaces the
        // ownership query rather than adding to it).
        const serverId = req.params[serverIdParam];
        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          select: {
            ownerId: true,
            Suspended: true,
            image: { select: { info: true } },
          },
        });
        setNavFeatures(res, server);

        if (user.isAdmin) {
          next();
          return;
        }

        if (server && server.ownerId === userId) {
          if (server.Suspended) {
            renderErrorPage(req, res, 403, 'This server is suspended.');
            return;
          }
          next();
          return;
        }

        // Subuser access: attach the SubUser row for downstream permission checks.
        const subUser = await findSubUser(getParamAsString(serverId), userId);
        if (subUser) {
          if (server?.Suspended) {
            renderErrorPage(req, res, 403, 'This server is suspended.');
            return;
          }
          req.subUser = subUser;
          next();
          return;
        }

        res.redirect('/');
      } catch (error) {
        logger.error(logT('log.authServerMiddlewareError'), error);
        res.redirect('/');
      }
    };

export const isAuthenticatedForServerWS =
  (serverIdParam = 'id') =>
    async (ws: WebSocket, req: Request, next: NextFunction): Promise<void> => {
      const userId = req.session?.user?.id;

      if (!userId) {
        ws.close();
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          ws.close();
          return;
        }

        if (user.isAdmin) {
          next();
          return;
        }

        const serverId = req.params[serverIdParam];
        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          select: { ownerId: true, Suspended: true },
        });

        if (server && server.ownerId === userId) {
          if (server.Suspended) {
            ws.close();
            return;
          }
          next();
          return;
        }

        const subUser = await findSubUser(getParamAsString(serverId), userId);
        if (subUser) {
          if (server?.Suspended) {
            ws.close();
            return;
          }
          req.subUser = subUser;
          next();
          return;
        }

        ws.close();
      } catch (error) {
        logger.error(logT('log.authServerWsError'), error);
        ws.close();
      }
    };

/**
 * Requires a specific subuser permission. Passes through for owners and admins
 * (who have no `req.subUser` attached). Use after `isAuthenticatedForServer`.
 */
export const requireSubUserPermission =
  (permission: SubUserPermission) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const subUser = req.subUser;

      if (!subUser) {
        next();
        return;
      }

      if (
        subUserHasPermission(
        subUser as unknown as { permissions: string | null | undefined },
        permission,
        )
      ) {
        next();
        return;
      }

      renderErrorPage(req, res, 403);
    };
