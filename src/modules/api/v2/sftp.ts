/**
 * V2 API — Server-scoped SFTP endpoints.
 *
 * GET    /api/v2/servers/:id/sftp           — Current credentials (password never returned)
 * POST   /api/v2/servers/:id/sftp           — Generate / rotate credentials
 * DELETE /api/v2/servers/:id/sftp           — Revoke credentials
 * GET    /api/v2/servers/:id/sftp/activity  — Recent SFTP activity
 *
 * Ported from legacy `src/modules/user/sftp.ts`.
 *
 * Daemon contract (`daemon/src/routes/sftp.ts`):
 *   POST   /sftp/credentials {id} → {username,password,host,port,expiresAt}
 *   DELETE /sftp/credentials {id} → {message}
 *   GET    /sftp/activity?server=<id> → {events: SftpActivityEvent[]}
 *
 * Shape notes (pinned from `views/user/server/sftp.ejs`):
 *   - `GET /` must answer 200 `{}` when no credential row exists: the page
 *     render route proxies it and a 404 would surface as an error page, and
 *     the view does `data.data || data` then reads `d.host` etc.
 *   - `POST` returns the plaintext password once (the view prints it).
 *   - `GET /activity` returns a bare array of `{action,path,timestamp}` —
 *     the view does `data.data || data` then `.slice(0, 10)`.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../../db';
import logger from '../../../handlers/logger';
import { daemonRequest, DaemonNodeNotFoundError } from '../../../services/daemonService';
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
  SFTP_CREDENTIAL_TIMEOUT_MS,
  SFTP_VALIDATE_TIMEOUT_MS,
} from '../../../config/daemonTimeouts';

const router = Router({ mergeParams: true });

/** Daemon `SftpActivityEvent` → the shape `sftp.ejs` renders. */
const AUDIT_EVENT: Record<string, string> = {
  write: 'file:sftp-write',
  rename: 'file:sftp-rename',
  remove: 'file:sftp-delete',
  mkdir: 'file:create',
};

interface DaemonActivityEvent {
  kind?: unknown;
  path?: unknown;
  from?: unknown;
  to?: unknown;
  username?: unknown;
  ip?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/sftp — stored credentials (no password)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.sftp')) {
    return;
  }

  try {
    const stored = await prisma.sftpCredential.findUnique({
      where: { serverId: resolved.server.UUID },
    });

    jsonOk(
      res,
      stored
        ? {
          username: stored.username,
          host: stored.host,
          port: stored.port,
          expiresAt: stored.expiresAt,
        }
        : {},
    );
  } catch (error) {
    logger.error('SFTP credential fetch error:', error);
    jsonError(
      res,
      'INTERNAL_ERROR',
      'Internal error while fetching SFTP credentials.',
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/sftp — generate / rotate credentials
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.sftp')) {
    return;
  }

  const serverUUID = resolved.server.UUID;
  const server = await prisma.server.findUnique({
    where: { UUID: serverUUID },
    include: { node: true },
  });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  try {
    const existing = await prisma.sftpCredential.findUnique({
      where: { serverId: serverUUID },
    });

    if (existing) {
      try {
        await daemonRequest(serverUUID, '/sftp/credentials', {
          method: 'DELETE',
          body: { id: serverUUID },
          timeout: SFTP_CREDENTIAL_TIMEOUT_MS,
        });
      } catch {
        // non-fatal — regenerate anyway
      }
    }

    const response = await daemonRequest(serverUUID, '/sftp/credentials', {
      method: 'POST',
      body: { id: serverUUID },
      timeout: SFTP_VALIDATE_TIMEOUT_MS,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      const message =
        body?.error ||
        body?.message ||
        'The daemon failed to generate SFTP credentials.';
      return jsonError(res, 'DAEMON_ERROR', message, 502);
    }

    const data = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const username = asString(data?.username);
    const password = asString(data?.password);
    const port = typeof data?.port === 'number' ? data.port : NaN;
    const expiresRaw = asString(data?.expiresAt);
    const expiresDate = expiresRaw ? new Date(expiresRaw) : null;

    if (
      !username ||
      !password ||
      !Number.isInteger(port) ||
      (expiresDate && isNaN(expiresDate.getTime()))
    ) {
      logger.error(
        `Daemon returned malformed SFTP credentials for server ${serverUUID}`,
      );
      return jsonError(
        res,
        'DAEMON_ERROR',
        'The daemon returned invalid SFTP credentials.',
        502,
      );
    }

    const host = server.node.address;
    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.sftpCredential.upsert({
      where: { serverId: serverUUID },
      update: {
        username,
        password: hashedPassword,
        host,
        port,
        expiresAt: expiresDate,
      },
      create: {
        serverId: serverUUID,
        username,
        password: hashedPassword,
        host,
        port,
        expiresAt: expiresDate,
      },
    });

    logActivity(
      getAuthenticatedUserId(req),
      'sftp.credentials.generated',
      serverUUID,
      { username, port },
      req.ip,
    );

    jsonOk(res, { username, password, host, port, expiresAt: expiresDate });
  } catch (error) {
    if (error instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    logger.error('SFTP credential request error:', error);
    jsonError(
      res,
      'INTERNAL_ERROR',
      'Internal error while generating SFTP credentials.',
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/sftp — revoke credentials
// ---------------------------------------------------------------------------
router.delete('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.sftp')) {
    return;
  }

  const serverUUID = resolved.server.UUID;

  try {
    await daemonRequest(serverUUID, '/sftp/credentials', {
      method: 'DELETE',
      body: { id: serverUUID },
      timeout: SFTP_CREDENTIAL_TIMEOUT_MS,
    });

    await prisma.sftpCredential.deleteMany({ where: { serverId: serverUUID } });

    logActivity(
      getAuthenticatedUserId(req),
      'sftp.credentials.revoked',
      serverUUID,
      {},
      req.ip,
    );

    jsonOk(res, { message: 'SFTP credentials revoked.' });
  } catch (error) {
    if (error instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    logger.error('SFTP revocation error:', error);
    jsonError(
      res,
      'INTERNAL_ERROR',
      'Internal error while revoking SFTP credentials.',
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/sftp/activity — recent activity (drains the buffer)
// ---------------------------------------------------------------------------
router.get('/activity', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.sftp')) {
    return;
  }

  const serverUUID = resolved.server.UUID;
  const userId = getAuthenticatedUserId(req);

  try {
    const response = await daemonRequest(
      serverUUID,
      `/sftp/activity?server=${encodeURIComponent(serverUUID)}`,
      { timeout: SFTP_CREDENTIAL_TIMEOUT_MS },
    );

    if (!response.ok) {
      jsonOk(res, []);
      return;
    }

    const payload = (await response.json().catch(() => null)) as {
      events?: DaemonActivityEvent[];
    } | null;

    const events = Array.isArray(payload?.events) ? payload.events : [];

    // The daemon buffer has no timestamps — events are drained on every read
    // so "now" is accurate for rendering purposes.
    const now = new Date().toISOString();

    for (const event of events) {
      const kind = asString(event.kind);
      const path = asString(event.path) || asString(event.from);
      const auditEvent = AUDIT_EVENT[kind];

      // Only real file mutations belong in the audit log; session lifecycle
      // and view-only reads are noise.
      if (auditEvent) {
        logActivity(userId, auditEvent, serverUUID, {
          username: asString(event.username),
          ip: asString(event.ip),
          ...(path ? { path } : {}),
        });
      }
    }

    jsonOk(
      res,
      events.map((event) => ({
        action: asString(event.kind) || 'event',
        path: asString(event.path) || asString(event.from) || asString(event.to),
        timestamp: now,
      })),
    );
  } catch (error) {
    if (error instanceof DaemonNodeNotFoundError) {
      return jsonOk(res, []);
    }
    logger.error('SFTP activity drain error:', error);
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

export default router;
