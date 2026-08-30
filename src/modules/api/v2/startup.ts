/**
 * V2 API — Startup endpoints.
 *
 * GET  /api/v2/servers/:id/startup            — Get startup config
 * POST /api/v2/servers/:id/startup/command     — Save startup command
 * POST /api/v2/servers/:id/startup/docker-image — Save docker image
 * POST /api/v2/servers/:id/startup/variables   — Save environment variables
 */

import { Router } from 'express';
import prisma from '../../../db';
import { parseBody } from '../../../utils/validation';
import {
  jsonOk,
  jsonError,
  resolveServer,
  requireSubUserPermission,
  checkSuspended,
  logActivity,
  getAuthenticatedUserId,
} from './helpers';
import {
  saveStartupCommandBody,
  saveDockerImageBody,
  saveVariablesBody,
} from './dto';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/startup — Get startup config
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  const server = await prisma.server.findUnique({
    where: { UUID: resolved.server.UUID },
    select: {
      StartCommand: true,
      dockerImage: true,
      Variables: true,
      allowStartupEdit: true,
      image: {
        select: {
          id: true,
          name: true,
          dockerImages: true,
          startup: true,
          stop: true,
          startup_done: true,
          config_files: true,
          info: true,
          scripts: true,
          variables: true,
        },
      },
    },
  });

  // Parse variables JSON
  let variables: unknown[];
  try {
    variables = server?.Variables ? JSON.parse(server.Variables) : [];
  } catch {
    variables = [];
  }

  jsonOk(res, {
    startCommand: server?.StartCommand ?? null,
    dockerImage: server?.dockerImage ?? null,
    variables,
    allowStartupEdit: server?.allowStartupEdit ?? false,
    image: server?.image ?? null,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/startup/command — Save startup command
// ---------------------------------------------------------------------------
router.post('/command', parseBody(saveStartupCommandBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  if (!resolved.server.allowStartupEdit) {
    return jsonError(
      res,
      'FORBIDDEN',
      'Startup editing is disabled for this server',
      403,
    );
  }

  const { command } = req.validatedBody as { command: string | null };

  await prisma.server.update({
    where: { UUID: resolved.server.UUID },
    data: { StartCommand: command },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'startup.command.updated',
    resolved.server.UUID,
    { command },
    req.ip,
  );

  jsonOk(res, { startCommand: command });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/startup/docker-image — Save docker image
// ---------------------------------------------------------------------------
router.post(
  '/docker-image',
  parseBody(saveDockerImageBody),
  async (req, res) => {
    const resolved = await resolveServer(req, res);
    if (!resolved) {
      return;
    }
    if (checkSuspended(res, resolved)) {
      return;
    }
    if (!requireSubUserPermission(res, resolved, 'console')) {
      return;
    }

    const { dockerImage } = req.validatedBody as { dockerImage: string };

    // Verify the image is allowed for this server's image definition
    const image = await prisma.images.findUnique({
      where: { id: resolved.server.imageId },
    });
    if (image?.dockerImages) {
      const allowed = image.dockerImages.split(',').map((s) => s.trim());
      if (!allowed.includes(dockerImage)) {
        return jsonError(
          res,
          'BAD_REQUEST',
          'Docker image is not allowed for this server',
          400,
        );
      }
    }

    await prisma.server.update({
      where: { UUID: resolved.server.UUID },
      data: { dockerImage },
    });

    logActivity(
      getAuthenticatedUserId(req),
      'startup.docker.updated',
      resolved.server.UUID,
      { dockerImage },
      req.ip,
    );

    jsonOk(res, { dockerImage });
  },
);

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/startup/variables — Save environment variables
// ---------------------------------------------------------------------------
router.post('/variables', parseBody(saveVariablesBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  const { variables } = req.validatedBody as {
    variables: {
      key: string;
      value: string;
      editable?: boolean;
      rules?: string;
    }[];
  };

  const variablesJson = JSON.stringify(variables);

  await prisma.server.update({
    where: { UUID: resolved.server.UUID },
    data: { Variables: variablesJson },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'startup.variables.updated',
    resolved.server.UUID,
    { count: variables.length },
    req.ip,
  );

  jsonOk(res, { variables });
});

export default router;
