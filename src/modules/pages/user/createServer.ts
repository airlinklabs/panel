import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { apiGet, apiPost } from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';
import prisma from '../../../db';
import { getSettings } from '../../../handlers/settingsCache';
import {
  DEFAULT_MAX_MEMORY_MB,
  DEFAULT_MAX_CPU_PERCENT,
  DEFAULT_MAX_STORAGE_MB,
} from '../../../config/server';

type SettingsRow = Awaited<ReturnType<typeof getSettings>>;

/**
 * Same fallback chain as v2 `POST /servers` (which is the authoritative
 * limiter); this only feeds the "Max: …" hints rendered in the form.
 */
async function resolveUserResourceLimits(
  userId: number,
  settings: SettingsRow,
) {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  const isPrivilegedRole = user?.role === 'privileged';
  return {
    maxMemory:
      user?.maxMemory ??
      settings?.[
        isPrivilegedRole ? 'allowPrivilegedMaxMemory' : 'defaultMaxMemory'
      ] ??
      DEFAULT_MAX_MEMORY_MB,
    maxCpu:
      user?.maxCpu ??
      settings?.[
        isPrivilegedRole ? 'allowPrivilegedMaxCpu' : 'defaultMaxCpu'
      ] ??
      DEFAULT_MAX_CPU_PERCENT,
    maxStorage:
      user?.maxStorage ??
      settings?.[
        isPrivilegedRole ? 'allowPrivilegedMaxStorage' : 'defaultMaxStorage'
      ] ??
      DEFAULT_MAX_STORAGE_MB,
  };
}

const module: Module = {
  info: {
    name: 'User Create Server',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: 'Create-server page and form submission',
  },
  router: () => {
    const router = Router();

    // Create server form — nodes, images and the user's resource limits.
    // v2 has no user-facing nodes/images endpoints, and page controllers are
    // allowed to query Prisma directly for view-only data (decision record).
    router.get(
      '/create-server',
      isAuthenticated(false),
      async (req, res, next) => {
        try {
          const userId = req.session?.user?.id;
          const [account, servers, settings] = await Promise.all([
            apiGet(req, '/account').catch(() => ({})),
            apiGet(req, '/servers').catch(() => []),
            getSettings(),
          ]);

          const resourceLimits =
            userId !== undefined
              ? await resolveUserResourceLimits(userId, settings)
              : undefined;

          const [nodes, rawImages] = await Promise.all([
            prisma.node.findMany({
              select: { id: true, name: true, address: true },
            }),
            prisma.images.findMany({
              where: { status: 'approved' },
              select: { id: true, name: true, dockerImages: true },
            }),
          ]);

          // `create-server.ejs` does `JSON.parse(image.dockerImages)` — the
          // Json column arrives as an array, so hand the view a string.
          const images = rawImages.map((img) => ({
            id: img.id,
            name: img.name,
            dockerImages:
              typeof img.dockerImages === 'string'
                ? img.dockerImages
                : JSON.stringify(img.dockerImages ?? []),
          }));

          res.render('user/create-server', {
            account,
            servers: Array.isArray(servers) ? servers : [],
            nodes,
            images,
            resourceLimits,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // Submit create server
    router.post(
      '/create-server',
      isAuthenticated(false),
      async (req, res, next) => {
        try {
          await apiPost(req, '/servers', req.body);
          res.redirect('/');
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
