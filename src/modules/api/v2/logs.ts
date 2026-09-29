/**
 * V2 API — Server logs endpoints.
 *
 * GET /api/v2/servers/:id/logs/history               — Recent console output
 * GET /api/v2/servers/:id/logs/archives              — Rotated archive list
 * GET /api/v2/servers/:id/logs/archives/read?file=   — Archive contents
 * GET /api/v2/servers/:id/logs/archives/download?file= — Download token
 *
 * Ported from legacy `src/modules/user/server/console.ts`.
 *
 * Daemon contract (`daemon/src/routes/logs.ts`):
 *   GET  /container/logs/history?id=                  → { containerId, logs }
 *   GET  /container/logs/archives?id=                 → { logs: [{fileName,size,createdAt}] }
 *   GET  /container/logs/archives/read?id=&file=      → { lines }
 *   POST /container/logs/archives/download-token {id,file} → { token, url }
 *
 * Shape notes:
 *   - `history` / `archives` / `archives/read` are read directly by
 *     `public/javascript/user/server/logs.js`, which reads `d.logs` /
 *     `d.lines` at the TOP level, so they use `jsonOkFlat`. The page routes
 *     (`res.json(apiGet(...))`) unwrap the same envelope, so both the direct
 *     fetch and the proxied one see the flat object.
 *   - `file` is validated against `^[A-Za-z0-9._-]+$` exactly like legacy.
 */

import { Router } from 'express';
import logger from '../../../handlers/logger';
import { daemonRequest, DaemonNodeNotFoundError } from '../../../services/daemonService';
import { jsonOk, jsonOkFlat, jsonError, resolveServer, requireSubUserPermission } from './helpers';

const router = Router({ mergeParams: true });

const LOG_HISTORY_TIMEOUT_MS = 8_000;
const DOWNLOAD_TOKEN_TIMEOUT_MS = 15_000;

/** Legacy validates archive names with this exact pattern. */
const SAFE_FILE = /^[A-Za-z0-9._-]+$/;

function resolveArchiveFile(raw: unknown): string | null {
  return typeof raw === 'string' && raw && SAFE_FILE.test(raw) ? raw : null;
}

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/logs/history
// ---------------------------------------------------------------------------
router.get('/history', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/container/logs/history?id=${encodeURIComponent(resolved.server.UUID)}`,
      { timeout: LOG_HISTORY_TIMEOUT_MS },
    );

    if (!response.ok) {
      jsonOkFlat(res, { logs: [] });
      return;
    }

    const payload = (await response.json().catch(() => null)) as {
      logs?: unknown;
    } | null;

    jsonOkFlat(res, {
      logs: Array.isArray(payload?.logs) ? payload.logs : [],
    });
  } catch (error) {
    logger.error('Error fetching server log history:', error);
    jsonOkFlat(res, { logs: [] });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/logs/archives
// ---------------------------------------------------------------------------
router.get('/archives', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/container/logs/archives?id=${encodeURIComponent(resolved.server.UUID)}`,
      { timeout: LOG_HISTORY_TIMEOUT_MS },
    );

    if (!response.ok) {
      jsonOkFlat(res, { logs: [] });
      return;
    }

    const payload = (await response.json().catch(() => null)) as {
      logs?: unknown;
    } | null;

    jsonOkFlat(res, {
      logs: Array.isArray(payload?.logs) ? payload.logs : [],
    });
  } catch (error) {
    logger.error('Error fetching server log archives:', error);
    jsonOkFlat(res, { logs: [] });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/logs/archives/read?file=
// ---------------------------------------------------------------------------
router.get('/archives/read', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  const file = resolveArchiveFile(req.query.file);
  if (!file) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid file name', 400);
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/container/logs/archives/read?id=${encodeURIComponent(resolved.server.UUID)}&file=${encodeURIComponent(file)}`,
      { timeout: LOG_HISTORY_TIMEOUT_MS },
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 404) {
        return jsonError(res, 'NOT_FOUND', 'Log archive not found', 404);
      }
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Daemon returned ${status}: ${text}`,
        502,
      );
    }

    const payload = (await response.json().catch(() => null)) as {
      lines?: unknown;
    } | null;

    jsonOkFlat(res, {
      lines: Array.isArray(payload?.lines) ? payload.lines : [],
    });
  } catch (error) {
    if (error instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    logger.error('Error reading server log archive:', error);
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/logs/archives/download?file=
//
// Returns the minted download token rather than issuing a 302: the page
// controller proxies this route with `res.json(data)`, so a redirect would be
// swallowed by the internal fetch. The page route is expected to
// `res.redirect(data.url)` on the returned `{ file, token, url }`.
// ---------------------------------------------------------------------------
router.get('/archives/download', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  const file = resolveArchiveFile(req.query.file);
  if (!file) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid file name', 400);
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      '/container/logs/archives/download-token',
      {
        method: 'POST',
        body: { id: resolved.server.UUID, file },
        timeout: DOWNLOAD_TOKEN_TIMEOUT_MS,
      },
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 404) {
        return jsonError(res, 'NOT_FOUND', 'Log archive not found', 404);
      }
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Daemon returned ${status}: ${text}`,
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

    jsonOk(res, { file, token: data.token, url: data.url });
  } catch (error) {
    if (error instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    logger.error('Error downloading server log archive:', error);
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

export default router;
