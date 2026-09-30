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
  saveStartupBody,
} from './dto';
import type { SaveStartupBody } from './dto';
import type { Prisma } from '../../../generated/prisma/client';
import { getImageFeatures } from '../../user/server/shared';
import type { ServerVariable } from '../../user/server/shared';
import { validateVariableRules } from '../../user/server/startup';

const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** `images.dockerImages` is a Json column: an array of `{ref: image}` maps,
 * a JSON string of the same, or null. Normalise to the array. */
function parseDockerVariants(raw: unknown): Record<string, string>[] {
  const keep = (value: unknown): value is Record<string, string> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

  if (Array.isArray(raw)) {
    return raw.filter(keep);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(keep);
      }
    } catch {
      /* fall through */
    }
  }
  return [];
}

/** Resolve a selected variant name to the full `{ name: ref }` map the
 * `server.dockerImage` column stores (the view does
 * `Object.keys(JSON.parse(server.dockerImage))[0]`). */
function resolveDockerVariant(
  raw: unknown,
  name: string,
): Record<string, string> | null {
  for (const variant of parseDockerVariants(raw)) {
    if (Object.keys(variant).includes(name)) {
      const ref = variant[name];
      if (typeof ref !== 'string') {
        continue;
      }
      return { [name]: ref };
    }
  }
  return null;
}

/** Merge `var_*` form fields (or a JSON `variables` array) onto the stored
 * definitions, preserving shape and defaults — ported from the legacy
 * form-data branch of `POST /server/:id/startup/variables`. */
function mergeVariables(
  definitions: ServerVariable[],
  submitted: unknown,
  body: Record<string, unknown>,
): ServerVariable[] {
  if (Array.isArray(submitted)) {
    return submitted as ServerVariable[];
  }

  return definitions.map((variable) => {
    const raw = body[`var_${variable.env}`];
    let value: string | number | boolean =
      typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
        ? raw
        : '';

    if (variable.type === 'boolean') {
      value = raw ? 1 : 0;
    } else if (variable.type === 'number') {
      const parsed = parseInt(String(raw), 10);
      if (isNaN(parsed) || raw === '' || raw === undefined) {
        value =
          variable.value !== undefined && variable.value !== null && variable.value !== ''
            ? variable.value
            : variable.default || 0;
      } else {
        value = parsed;
      }
    } else if (variable.type === 'text') {
      if (raw === '' || raw === undefined) {
        value =
          variable.value !== undefined && variable.value !== null && variable.value !== ''
            ? variable.value
            : variable.default || '';
      }
    }

    return { ...variable, value };
  });
}

/**
 * Validate submitted variables against the *stored* definitions. Returns the
 * first list of `{ key, error }` failures, or `[]` when everything passes.
 */
function validateVariables(
  definitions: ServerVariable[],
  submitted: ServerVariable[],
): { key: string; error: string }[] {
  const byEnv = new Map(definitions.map((def) => [def.env, def]));

  return submitted
    .map((variable) => {
      const definition = byEnv.get(variable.env);
      const source = definition ? { ...definition } : variable;
      const error = validateVariableRules(
        source as ServerVariable,
        String(variable.value ?? ''),
      );
      return error ? { key: variable.env, error } : null;
    })
    .filter(
      (entry): entry is { key: string; error: string } => entry !== null,
    );
}

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/startup — Get startup config
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'startup')) {
    return;
  }

  const server = await prisma.server.findUnique({
    where: { UUID: resolved.server.UUID },
    include: {
      node: { select: { id: true, name: true } },
      image: true,
      owner: { select: { id: true, username: true } },
    },
  });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  // `views/user/server/startup.ejs` renders `server.*`, `serverVariables` and
  // (via the layout) `features`.
  const serverVariables: ServerVariable[] = Array.isArray(server.Variables)
    ? (server.Variables as unknown as ServerVariable[])
    : [];

  jsonOk(res, {
    server,
    serverVariables,
    features: getImageFeatures(server.image),
    startCommand: server.StartCommand ?? null,
    dockerImage: server.dockerImage ?? null,
    variables: serverVariables,
    allowStartupEdit: server.allowStartupEdit ?? false,
    image: server.image ?? null,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/startup — save command + docker image + variables
//
// Save-all counterpart of the three section routes below: the page controller
// proxies `POST /server/:id/startup` here with `{ startCommand, dockerImage,
// variables }`. Only the keys present in the body are written.
// ---------------------------------------------------------------------------
router.post('/', parseBody(saveStartupBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'startup')) {
    return;
  }

  const serverUUID = resolved.server.UUID;
  const data = req.validatedBody as SaveStartupBody;

  const current = await prisma.server.findUnique({
    where: { UUID: serverUUID },
    include: { image: true },
  });
  if (!current) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  const updateData: Record<string, unknown> = {};
  const definitions: ServerVariable[] = Array.isArray(current.Variables)
    ? (current.Variables as unknown as ServerVariable[])
    : [];

  // ── Startup command ──────────────────────────────────────────────────
  const command =
    data.startCommand !== undefined
      ? data.startCommand
      : data.command !== undefined
        ? data.command
        : undefined;
  if (command !== undefined) {
    if (!current.allowStartupEdit) {
      return jsonError(
        res,
        'FORBIDDEN',
        'Startup command editing is disabled for this server',
        403,
      );
    }
    updateData.StartCommand = command || null;
  }

  // ── Docker image ─────────────────────────────────────────────────────
  if (data.dockerImage !== undefined) {
    const variant = resolveDockerVariant(
      current.image?.dockerImages,
      data.dockerImage,
    );
    if (!variant) {
      return jsonError(
        res,
        'BAD_REQUEST',
        'Invalid Docker image selected',
        400,
      );
    }
    updateData.dockerImage = JSON.stringify(variant);
  }

  // ── Variables ────────────────────────────────────────────────────────
  let nextVariables: ServerVariable[] | null = null;
  if (data.variables !== undefined) {
    nextVariables = mergeVariables(
      definitions,
      data.variables,
      req.body as Record<string, unknown>,
    );

    const validationErrors = validateVariables(definitions, nextVariables);
    if (validationErrors.length > 0) {
      return jsonError(
        res,
        'BAD_REQUEST',
        'Variable validation failed.',
        400,
        validationErrors.map((entry) => ({
          field: entry.key,
          message: entry.error,
        })),
      );
    }
    updateData.Variables = nextVariables as unknown as Prisma.InputJsonValue;
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError(res, 'BAD_REQUEST', 'No startup fields supplied', 400);
  }

  const server = await prisma.server.update({
    where: { UUID: serverUUID },
    data: updateData,
  });

  const serverVariables: ServerVariable[] = Array.isArray(server.Variables)
    ? (server.Variables as unknown as ServerVariable[])
    : (nextVariables ?? definitions);

  logActivity(
    getAuthenticatedUserId(req),
    'startup.updated',
    serverUUID,
    { fields: Object.keys(updateData) },
    req.ip,
  );

  jsonOk(res, {
    server,
    startCommand: server.StartCommand ?? null,
    dockerImage: server.dockerImage ?? null,
    serverVariables,
    variables: serverVariables,
    allowStartupEdit: server.allowStartupEdit,
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
  if (!requireSubUserPermission(res, resolved, 'startup')) {
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

  const { startCommand, command } = req.validatedBody as {
    startCommand?: string;
    command?: string | null;
  };
  const value = startCommand !== undefined ? startCommand : command;
  if (value === undefined) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'startCommand or command is required',
      400,
    );
  }

  await prisma.server.update({
    where: { UUID: resolved.server.UUID },
    data: { StartCommand: value || null },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'startup.command.updated',
    resolved.server.UUID,
    { command: value },
    req.ip,
  );

  jsonOk(res, { startCommand: value || null });
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
    if (!requireSubUserPermission(res, resolved, 'startup')) {
      return;
    }

    const { dockerImage } = req.validatedBody as { dockerImage: string };

    // Verify the image is allowed for this server's image definition.
    // `images.dockerImages` is a Json column holding `[{ ref: image }]` maps.
    const image = await prisma.images.findUnique({
      where: { id: resolved.server.imageId },
    });
    const variant = resolveDockerVariant(image?.dockerImages, dockerImage);
    if (image?.dockerImages && !variant) {
      return jsonError(
        res,
        'BAD_REQUEST',
        'Docker image is not allowed for this server',
        400,
      );
    }

    await prisma.server.update({
      where: { UUID: resolved.server.UUID },
      data: { dockerImage: JSON.stringify(variant ?? { [dockerImage]: dockerImage }) },
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
  if (!requireSubUserPermission(res, resolved, 'startup')) {
    return;
  }

  const { variables } = req.validatedBody as {
    variables: Record<string, unknown>[];
  };

  await prisma.server.update({
    where: { UUID: resolved.server.UUID },
    data: {
      Variables: variables as unknown as Prisma.InputJsonValue,
    },
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
