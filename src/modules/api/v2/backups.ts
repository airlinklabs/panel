/**
 * V2 API — Backups endpoints.
 *
 * GET    /api/v2/servers/:id/backups                  — List backups
 * POST   /api/v2/servers/:id/backups                  — Create backup
 * DELETE /api/v2/servers/:id/backups/:backupId         — Delete backup
 * POST   /api/v2/servers/:id/backups/:backupId/restore — Restore backup
 * PATCH  /api/v2/servers/:id/backups/:backupId/lock    — Toggle lock
 * GET    /api/v2/servers/:id/backups/:backupId/download — Download backup
 * GET    /api/v2/servers/:id/backups/progress           — Backup progress
 * GET    /api/v2/servers/:id/backups/restore/progress   — Restore progress
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
  paginateQuery,
  parsePage,
  parsePerPage,
} from './helpers';
import { createBackupBody } from './dto';
import {
  daemonRequest,
  DaemonNodeNotFoundError,
} from '../../../services/daemonService';
import { daemonBaseUrl } from '../../../handlers/utils/core/daemonRequest';
import { persistBackupRecord } from '../../user/server/backups';
import {
  DAEMON_TIMEOUT_BACKUP_MS,
  DAEMON_TIMEOUT_BACKUP_RESTORE_MS,
} from '../../../config/daemonTimeouts';

const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/backups — List backups
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'backups')) {
    return;
  }

  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);
  const where = { serverId: resolved.server.UUID };

  const { data: backups, meta } = await paginateQuery(
    (args) =>
      prisma.backup.findMany({
        where,
        ...args,
        orderBy: { createdAt: 'desc' },
      }),
    () => prisma.backup.count({ where }),
    page,
    perPage,
  );

  jsonOk(res, backups, meta);
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/backups — Create backup
// ---------------------------------------------------------------------------
router.post('/', parseBody(createBackupBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'backups.create')) {
    return;
  }

  const name =
    (req.validatedBody as { name?: string }).name?.trim() ||
    `Backup ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;

  // Check backup limit
  const backupCount = await prisma.backup.count({
    where: { serverId: resolved.server.UUID },
  });
  if (
    resolved.server.backupLimit > 0 &&
    backupCount >= resolved.server.backupLimit
  ) {
    return jsonError(res, 'FORBIDDEN', 'Backup limit reached', 403);
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      '/container/backup',
      {
        method: 'POST',
        body: { id: resolved.server.UUID, name },
        timeout: DAEMON_TIMEOUT_BACKUP_MS,
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Failed to create backup: ${text}`,
        502,
      );
    }

    // The daemon runs the tar synchronously and answers with the artifact
    // descriptor — persist it now so the backup is listable (and later
    // restorable/deletable) the moment this response lands.
    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      backup?: {
        uuid: string;
        name: string;
        filePath: string;
        size: number;
        checksum?: string;
      };
    } | null;

    if (!payload?.success || !payload.backup?.filePath) {
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Failed to create backup: ${payload?.error || 'daemon returned no artifact'}`,
        502,
      );
    }

    const record = await persistBackupRecord({
      uuid: payload.backup.uuid,
      name,
      serverId: resolved.server.UUID,
      filePath: payload.backup.filePath,
      size: BigInt(payload.backup.size ?? 0),
      checksum:
        typeof payload.backup.checksum === 'string'
          ? payload.backup.checksum
          : null,
      airlinkCloudId: null,
    });

    logActivity(
      getAuthenticatedUserId(req),
      'backup.created',
      resolved.server.UUID,
      { name },
      req.ip,
    );

    jsonOk(res, { name, status: 'created', backupId: record.UUID });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/backups/:backupId — Delete backup
// ---------------------------------------------------------------------------
router.delete('/:backupId', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'backups.delete')) {
    return;
  }

  const backup = await prisma.backup.findUnique({
    where: { UUID: req.params.backupId },
  });
  if (!backup || backup.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Backup not found', 404);
  }

  if (backup.locked) {
    return jsonError(res, 'FORBIDDEN', 'Backup is locked', 403);
  }

  try {
    await daemonRequest(resolved.server.UUID, '/container/backup', {
      method: 'DELETE',
      body: { backupPath: backup.filePath },
      timeout: DAEMON_TIMEOUT_BACKUP_MS,
    });
  } catch {
    // Best effort — the record goes away either way so the UI stays honest;
    // an orphaned tar on the node is swept by the daemon's backup dir layout.
  }

  await prisma.backup.delete({ where: { UUID: backup.UUID } });

  logActivity(
    getAuthenticatedUserId(req),
    'backup.deleted',
    resolved.server.UUID,
    { backupName: backup.name },
    req.ip,
  );

  jsonOk(res, { deleted: backup.UUID });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/backups/:backupId/restore — Restore backup
// ---------------------------------------------------------------------------
router.post('/:backupId/restore', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }

  const backup = await prisma.backup.findUnique({
    where: { UUID: req.params.backupId },
  });
  if (!backup || backup.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Backup not found', 404);
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      '/container/restore',
      {
        method: 'POST',
        body: {
          id: resolved.server.UUID,
          backupPath: backup.filePath,
          ...(backup.checksum ? { checksum: backup.checksum } : {}),
        },
        timeout: DAEMON_TIMEOUT_BACKUP_RESTORE_MS,
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Failed to restore backup: ${text}`,
        502,
      );
    }

    logActivity(
      getAuthenticatedUserId(req),
      'backup.restored',
      resolved.server.UUID,
      { backupName: backup.name },
      req.ip,
    );

    jsonOk(res, { backupId: backup.UUID, status: 'restoring' });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/servers/:id/backups/:backupId/lock — Toggle lock
// ---------------------------------------------------------------------------
router.patch('/:backupId/lock', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  const backup = await prisma.backup.findUnique({
    where: { UUID: req.params.backupId },
  });
  if (!backup || backup.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Backup not found', 404);
  }

  const updated = await prisma.backup.update({
    where: { UUID: backup.UUID },
    data: { locked: !backup.locked },
  });

  jsonOk(res, { UUID: updated.UUID, locked: updated.locked });
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/backups/:backupId/download — Download backup
// ---------------------------------------------------------------------------
router.get('/:backupId/download', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'backups')) {
    return;
  }

  const backup = await prisma.backup.findUnique({
    where: { UUID: req.params.backupId },
  });
  if (!backup || backup.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Backup not found', 404);
  }

  const server = await prisma.server.findUnique({
    where: { UUID: resolved.server.UUID },
    select: { UUID: true, node: { select: { address: true, port: true } } },
  });
  if (!server?.node) {
    return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
  }

  try {
    // Mint a one-time download token instead of proxying the tarball through
    // the panel — same pattern as the file manager's download flow.
    const response = await daemonRequest(server.UUID, '/container/backup/download-token', {
      method: 'POST',
      body: { backupPath: backup.filePath },
      timeout: DAEMON_TIMEOUT_BACKUP_MS,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Failed to prepare backup download: ${text}`,
        502,
      );
    }

    const data = (await response.json().catch(() => null)) as {
      token?: string;
      url?: string;
    } | null;

    if (!data?.token || !data?.url) {
      return jsonError(res, 'DAEMON_ERROR', 'Failed to start download', 502);
    }

    const base = await daemonBaseUrl(server.node.address, server.node.port);
    logActivity(
      getAuthenticatedUserId(req),
      'backup.downloaded',
      resolved.server.UUID,
      { backupName: backup.name },
      req.ip,
    );

    jsonOk(res, {
      file: backup.filePath,
      token: data.token,
      url: `${base}${data.url}`,
      filename: `${backup.name}.tar.gz`,
    });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/backups/progress — Backup progress
//
// Backup and restore are synchronous daemon operations: the create/restore
// request itself does not answer until the tar work is done, so by the time
// the browser polls this endpoint there is never anything in flight. Answer
// "idle" directly rather than proxying a daemon endpoint that doesn't exist.
// ---------------------------------------------------------------------------
router.get('/progress', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  jsonOk(res, { running: false, progress: 100, status: 'idle' });
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/backups/restore/progress — Restore progress
// ---------------------------------------------------------------------------
router.get('/restore/progress', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  jsonOk(res, { running: false, progress: 100, status: 'idle' });
});

export default router;
