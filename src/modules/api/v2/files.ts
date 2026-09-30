/**
 * V2 API — Files endpoints.
 *
 * GET    /api/v2/servers/:id/files              — List files (rows + server-side HTML)
 * GET    /api/v2/servers/:id/files/detail       — File/directory metadata
 * GET    /api/v2/servers/:id/files/content      — Read file content
 * POST   /api/v2/servers/:id/files/content      — Write file content
 * GET    /api/v2/servers/:id/files/download     — Mint a download URL
 * DELETE /api/v2/servers/:id/files              — Delete file/directory
 * POST   /api/v2/servers/:id/files/action       — Generic dispatcher
 * POST   /api/v2/servers/:id/files/rename       — Rename file
 * POST   /api/v2/servers/:id/files/mkdir        — Create directory
 * POST   /api/v2/servers/:id/files/copy         — Copy file
 * POST   /api/v2/servers/:id/files/zip          — Zip files
 * POST   /api/v2/servers/:id/files/unzip        — Unzip file
 * POST   /api/v2/servers/:id/files/upload       — Upload file (JSON body)
 * POST   /api/v2/servers/:id/files/pull         — Pull from URL
 *
 * Daemon contract (`/fs/*`, see daemon/src/routes/filesystem.ts):
 *   GET    /fs/list?id&path            → FsFileEntry[]
 *   GET    /fs/file/content?id&path    → text/plain
 *   POST   /fs/file/content {id,path,content}
 *   DELETE /fs/rm {id,path}
 *   POST   /fs/rename {id,path,newName,newPath}
 *   POST   /fs/mkdir {id,path,folderName}
 *   POST   /fs/copy {id,source,newPath}
 *   POST   /fs/zip {id,path,zipname}          (path may be a string[])
 *   POST   /fs/unzip {id,path,zipname}
 *   POST   /fs/pull {id,url,path}
 *   POST   /fs/upload {id,path,fileName,fileContent}
 *   POST   /fs/download-token {id,path} → {token,url}
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../../../db';
import { parseBody } from '../../../utils/validation';
import {
  jsonOk,
  jsonOkFlat,
  jsonError,
  resolveServer,
  requireSubUserPermission,
  checkSuspended,
  logActivity,
  getAuthenticatedUserId,
} from './helpers';
import {
  writeFileBody,
  renameFileBody,
  mkdirBody,
  copyFileBody,
  zipBody,
  unzipBody,
  pullFileBody,
  fileActionBody,
  uploadFileBody,
} from './dto';
import { daemonRequest } from '../../../services/daemonService';
import { daemonBaseUrl } from '../../../handlers/utils/core/daemonRequest';
import { fsListSchema, parseDaemonResponse } from '../../../types/daemon';
import { isPathSafe } from '../../../utils/pathSecurity';
import {
  DAEMON_TIMEOUT_FILE_MS,
  DAEMON_TIMEOUT_FILE_WRITE_MS,
  DAEMON_TIMEOUT_FILE_HEAVY_MS,
  DAEMON_TIMEOUT_MEDIUM_MS,
} from '../../../config/daemonTimeouts';

const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

type ServerRow = NonNullable<Awaited<ReturnType<typeof loadServerRow>>>;
interface FsEntry {
  name: string;
  type: 'file' | 'directory';
  extension?: string | null;
  category?: string | null;
  size?: number;
  modifiedAt?: string;
}

/** Server row with the relations the files views read (`server.node.name`,
 * `server.image.name`). `resolveServer` returns the bare row. */
function loadServerRow(uuid: string) {
  return prisma.server.findUnique({
    where: { UUID: uuid },
    include: {
      node: {
        select: { id: true, name: true, address: true, port: true },
      },
      image: {
        select: { id: true, name: true, dockerImages: true, startup: true },
      },
    },
  });
}

function normalizeDirPath(raw: unknown): string {
  const value = typeof raw === 'string' && raw ? raw : '/';
  return value.replace(/\/+/g, '/') || '/';
}

/** Collapse and reject traversal in a caller-supplied relative path. */
function safeRelativePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) {
    return null;
  }
  const collapsed = raw.replace(/\/+/g, '/');
  if (!isPathSafe(collapsed)) {
    return null;
  }
  return collapsed;
}

async function listDirectory(
  server: ServerRow,
  dirPath: string,
): Promise<{ ok: true; entries: FsEntry[] } | { ok: false; status: number; message: string }> {
  const response = await daemonRequest(
    server.UUID,
    `/fs/list?id=${encodeURIComponent(server.UUID)}&path=${encodeURIComponent(dirPath)}`,
    { timeout: DAEMON_TIMEOUT_FILE_MS },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => 'Daemon error');
    return { ok: false, status: response.status, message: text };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }

  // The daemon rate-limits bursts by answering { error: … } instead of an
  // array; treat anything unparseable as an empty listing rather than failing
  // the page render.
  const entries = (parseDaemonResponse(fsListSchema, raw) ?? []).filter(
    (entry) => entry.name !== 'airlink',
  );

  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return { ok: true, entries };
}

/** Render `views/user/server/files-rows.ejs` for the browser refresh path. */
function renderRows(
  res: Response,
  files: FsEntry[],
  currentPath: string,
  server: ServerRow,
): Promise<string> {
  return new Promise((resolve, reject) => {
    res.render(
      'user/server/files-rows',
      {
        files,
        filesCurrentPath: currentPath,
        currentPath,
        server,
      },
      (err: Error | null, html?: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(html ?? '');
        }
      },
    );
  });
}

/** Map a daemon error into the v2 envelope. */
function daemonFailure(
  res: Response,
  status: number,
  message: string,
): void {
  jsonError(
    res,
    status === 404 ? 'NOT_FOUND' : 'DAEMON_ERROR',
    `Daemon returned ${status}: ${message}`,
    status === 404 ? 404 : 502,
  );
}

/** The `fetch` Response `daemonRequest` resolves with. Named explicitly so
 * this module's Express `Response` import cannot shadow it. */
type DaemonResponse = Awaited<ReturnType<typeof daemonRequest>>;

async function readDaemonError(response: DaemonResponse): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) {
    return 'Daemon error';
  }
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error || parsed.message || text;
  } catch {
    return text;
  }
}

/**
 * Fill `req.body.file` from `?path=` / `?file=` before the DTO runs, so
 * `POST /files/content?path=…` (used by the new-file flow in files.js) and
 * `POST /files/content { file }` (page editor) share one schema.
 */
function fileFromBodyOrQuery(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const body =
    req.body && typeof req.body === 'object'
      ? (req.body as Record<string, unknown>)
      : {};
  const existing = body.file;
  if (typeof existing !== 'string' || !existing) {
    const fromQuery = req.query.path ?? req.query.file;
    if (typeof fromQuery === 'string' && fromQuery) {
      body.file = fromQuery;
    }
  }
  req.body = body;
  next();
}

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/files — List files
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.read')) {
    return;
  }

  const dirPath = normalizeDirPath(req.query.path);
  const server = await loadServerRow(resolved.server.UUID);
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  try {
    const listing = await listDirectory(server, dirPath);
    if (!listing.ok) {
      return daemonFailure(res, listing.status, listing.message);
    }

    // `files.js` replaces `<tbody>` with `data.html`, so the rows are rendered
    // here (the same template the SSR path includes). Page controllers unwrap
    // the envelope and spread the rest into the view.
    let html = '';
    try {
      html = await renderRows(res, listing.entries, dirPath, server);
    } catch {
      html = '';
    }

    jsonOkFlat(res, {
      files: listing.entries,
      filesCurrentPath: dirPath,
      currentPath: dirPath,
      server,
      html,
    });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/files/detail — File/directory metadata
// ---------------------------------------------------------------------------
router.get('/detail', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.read')) {
    return;
  }

  const rawTarget = req.query.file ?? req.query.path;
  const collapsed =
    typeof rawTarget === 'string' && rawTarget
      ? rawTarget.replace(/\/+/g, '/')
      : '/';
  const target = collapsed === '/' || !isPathSafe(collapsed) ? '/' : collapsed;
  const separator = target.lastIndexOf('/');
  const parentPath = separator <= 0 ? '/' : target.slice(0, separator);
  const name = target === '/' ? '' : target.slice(separator + 1);

  const server = await loadServerRow(resolved.server.UUID);
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  try {
    const listing = await listDirectory(server, parentPath);
    if (!listing.ok) {
      return daemonFailure(res, listing.status, listing.message);
    }

    // The daemon has no /fs/stat — resolve metadata from the parent listing.
    const entry = listing.entries.find((item) => item.name === name);
    const file =
      entry ??
      ({
        name: name || '/',
        type: (parentPath === '/' && !name ? 'directory' : 'file') as
          | 'file'
          | 'directory',
        extension: null,
        category: null,
        size: 0,
      } satisfies FsEntry);

    jsonOk(res, {
      file,
      parentPath,
      server,
    });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/files/content — Read file content
// ---------------------------------------------------------------------------
router.get('/content', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.read')) {
    return;
  }

  const rawFile = req.query.file ?? req.query.path;
  const filePath = safeRelativePath(rawFile);
  if (!filePath) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'file query parameter is required',
      400,
    );
  }

  const server = await loadServerRow(resolved.server.UUID);
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  try {
    const response = await daemonRequest(
      server.UUID,
      `/fs/file/content?id=${encodeURIComponent(server.UUID)}&path=${encodeURIComponent(filePath)}`,
      { timeout: DAEMON_TIMEOUT_FILE_MS },
    );

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    const content = await response.text();
    const extension = filePath.split('.').pop()?.toLowerCase() ?? '';

    jsonOk(res, {
      file: {
        name: filePath.split('/').pop() || filePath,
        path: filePath,
        content,
        extension,
      },
      server,
    });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/content — Write file content
// ---------------------------------------------------------------------------
router.post(
  '/content',
  fileFromBodyOrQuery,
  parseBody(writeFileBody),
  async (req, res) => {
    const resolved = await resolveServer(req, res);
    if (!resolved) {
      return;
    }
    if (checkSuspended(res, resolved)) {
      return;
    }
    if (!requireSubUserPermission(res, resolved, 'files.write')) {
      return;
    }

    const { file, content } = req.validatedBody as {
      file: string;
      content: string;
    };

    try {
      const response = await daemonRequest(
        resolved.server.UUID,
        '/fs/file/content',
        {
          method: 'POST',
          body: { id: resolved.server.UUID, path: file, content },
          timeout: DAEMON_TIMEOUT_FILE_WRITE_MS,
        },
      );

      if (!response.ok) {
        const message = await readDaemonError(response);
        return daemonFailure(res, response.status, message);
      }

      logActivity(
        getAuthenticatedUserId(req),
        'file:write',
        resolved.server.UUID,
        { path: file, bytes: content.length },
        req.ip,
      );

      jsonOk(res, { file, written: content.length });
    } catch {
      jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/files/download — Mint a download URL
// ---------------------------------------------------------------------------
router.get('/download', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.read')) {
    return;
  }

  const rawFile = req.query.file ?? req.query.path;
  const filePath = safeRelativePath(rawFile);
  if (!filePath) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'file query parameter is required',
      400,
    );
  }

  const server = await loadServerRow(resolved.server.UUID);
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  try {
    const response = await daemonRequest(server.UUID, '/fs/download-token', {
      method: 'POST',
      body: { id: server.UUID, path: filePath },
      timeout: DAEMON_TIMEOUT_FILE_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
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
      'file:download',
      server.UUID,
      { path: filePath },
      req.ip,
    );

    jsonOk(res, {
      file: filePath,
      token: data.token,
      url: `${base}${data.url}`,
    });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/files — Delete file/directory
//
// `files.js` issues `DELETE …/files?path=<relative>` with no body, so the
// target is taken from `?path=`, `?file=` or a JSON `{file}` body (in that
// order) instead of `parseBody`, which would 400 on an absent body.
// ---------------------------------------------------------------------------
router.delete('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const body =
    req.body && typeof req.body === 'object'
      ? (req.body as Record<string, unknown>)
      : {};
  const candidate =
    typeof req.query.path === 'string' && req.query.path
      ? req.query.path
      : typeof req.query.file === 'string' && req.query.file
        ? req.query.file
        : typeof body.file === 'string' && body.file
          ? body.file
          : typeof body.path === 'string' && body.path
            ? body.path
            : '';

  const filePath = safeRelativePath(candidate);
  if (!filePath) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'file query parameter is required',
      400,
    );
  }

  try {
    const response = await daemonRequest(resolved.server.UUID, '/fs/rm', {
      method: 'DELETE',
      body: { id: resolved.server.UUID, path: filePath },
      timeout: DAEMON_TIMEOUT_FILE_WRITE_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    logActivity(
      getAuthenticatedUserId(req),
      'file:delete',
      resolved.server.UUID,
      { path: filePath },
      req.ip,
    );

    jsonOk(res, { deleted: filePath });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/action — Generic dispatcher
// ---------------------------------------------------------------------------
router.post('/action', parseBody(fileActionBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const input = req.validatedBody as {
    action: string;
    file?: string;
    path?: string;
    target?: string;
    name?: string;
    newname?: string;
    newName?: string;
    files?: string[];
    content?: string;
    zipname?: string;
    relativePath?: string;
    url?: string;
  };

  const uuid = resolved.server.UUID;
  const source = safeRelativePath(input.file ?? input.path);
  const targetPath = safeRelativePath(input.target ?? input.relativePath);
  const action = input.action.toLowerCase();

  let path: string;
  let body: unknown;
  let timeout = DAEMON_TIMEOUT_FILE_WRITE_MS;

  switch (action) {
  case 'delete':
  case 'remove':
  case 'rm': {
    if (!source) {
      return jsonError(res, 'BAD_REQUEST', 'file is required', 400);
    }
    path = '/fs/rm';
    body = { id: uuid, path: source };
    break;
  }
  case 'mkdir':
  case 'create-folder':
  case 'create_folder': {
    const folderName = (input.name ?? '').trim();
    if (!folderName) {
      return jsonError(res, 'BAD_REQUEST', 'name is required', 400);
    }
    path = '/fs/mkdir';
    body = { id: uuid, path: targetPath ?? '/', folderName };
    timeout = DAEMON_TIMEOUT_FILE_MS;
    break;
  }
  case 'create':
  case 'create-file':
  case 'create_file': {
    const fileName = (input.name ?? input.file ?? '').trim();
    if (!fileName) {
      return jsonError(res, 'BAD_REQUEST', 'name is required', 400);
    }
    path = '/fs/create-empty-file';
    body = {
      id: uuid,
      path: targetPath ?? '/',
      fileName: fileName.replace(/^.*\//, ''),
    };
    timeout = DAEMON_TIMEOUT_FILE_MS;
    break;
  }
  case 'rename':
  case 'move': {
    const nextName = input.newName ?? input.newname ?? input.target;
    if (!source || !nextName) {
      return jsonError(res, 'BAD_REQUEST', 'file and newname required', 400);
    }
    path = '/fs/rename';
    body = { id: uuid, path: source, newName: nextName, newPath: nextName };
    break;
  }
  case 'copy':
  case 'duplicate': {
    if (!source) {
      return jsonError(res, 'BAD_REQUEST', 'file is required', 400);
    }
    path = '/fs/copy';
    body = { id: uuid, source, newPath: targetPath };
    break;
  }
  case 'compress':
  case 'zip': {
    const zipPaths = input.files?.length
      ? input.files
      : source
        ? [source]
        : null;
    if (!zipPaths) {
      return jsonError(res, 'BAD_REQUEST', 'files is required', 400);
    }
    path = '/fs/zip';
    body = {
      id: uuid,
      path: zipPaths,
      zipname: input.zipname ?? input.name ?? 'archive',
    };
    timeout = DAEMON_TIMEOUT_FILE_HEAVY_MS;
    break;
  }
  case 'decompress':
  case 'unzip': {
    const zipname = input.file ?? input.zipname ?? input.name;
    if (!zipname) {
      return jsonError(res, 'BAD_REQUEST', 'file is required', 400);
    }
    path = '/fs/unzip';
    body = { id: uuid, path: targetPath ?? '/', zipname };
    timeout = DAEMON_TIMEOUT_FILE_HEAVY_MS;
    break;
  }
  case 'pull': {
    if (!input.url) {
      return jsonError(res, 'BAD_REQUEST', 'url is required', 400);
    }
    path = '/fs/pull';
    body = { id: uuid, url: input.url, path: targetPath ?? '/' };
    timeout = DAEMON_TIMEOUT_FILE_HEAVY_MS;
    break;
  }
  default:
    return jsonError(res, 'BAD_REQUEST', `Unknown action: ${action}`, 400);
  }

  try {
    const response = await daemonRequest(uuid, path, {
      method: 'POST',
      body,
      timeout,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    logActivity(
      getAuthenticatedUserId(req),
      `file:${action}`,
      uuid,
      { path: source ?? targetPath ?? null },
      req.ip,
    );

    jsonOk(res, { action, ok: true });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/rename — Rename file
// ---------------------------------------------------------------------------
router.post('/rename', parseBody(renameFileBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const { file, newname } = req.validatedBody as {
    file: string;
    newname: string;
  };

  try {
    const response = await daemonRequest(resolved.server.UUID, '/fs/rename', {
      method: 'POST',
      body: {
        id: resolved.server.UUID,
        path: file,
        newName: newname,
        newPath: newname,
      },
      timeout: DAEMON_TIMEOUT_FILE_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    logActivity(
      getAuthenticatedUserId(req),
      'file:rename',
      resolved.server.UUID,
      { path: file, newName: newname },
      req.ip,
    );

    jsonOk(res, { file, newname });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/mkdir — Create directory
// ---------------------------------------------------------------------------
router.post('/mkdir', parseBody(mkdirBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const input = req.validatedBody as { name: string };
  // files.js sends `{ path: parent, name }` where `path` is the directory the
  // folder is created in ("" or "/" for the volume root).
  const rawParent =
    req.body && typeof req.body === 'object'
      ? (req.body as Record<string, unknown>).path
      : undefined;
  const parent = typeof rawParent === 'string' ? normalizeDirPath(rawParent) : '/';
  const name = input.name.trim();

  if (name.includes('/') || name.includes('..')) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid folder name', 400);
  }

  try {
    const response = await daemonRequest(resolved.server.UUID, '/fs/mkdir', {
      method: 'POST',
      body: {
        id: resolved.server.UUID,
        path: parent,
        folderName: name,
      },
      timeout: DAEMON_TIMEOUT_FILE_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    logActivity(
      getAuthenticatedUserId(req),
      'file:mkdir',
      resolved.server.UUID,
      { path: `${parent}/${name}` },
      req.ip,
    );

    jsonOk(res, { name, created: true });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/copy — Copy file
// ---------------------------------------------------------------------------
router.post('/copy', parseBody(copyFileBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const { file, target } = req.validatedBody as {
    file: string;
    target: string;
  };

  try {
    const response = await daemonRequest(resolved.server.UUID, '/fs/copy', {
      method: 'POST',
      body: {
        id: resolved.server.UUID,
        source: file,
        newPath: target,
      },
      timeout: DAEMON_TIMEOUT_FILE_WRITE_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    logActivity(
      getAuthenticatedUserId(req),
      'file:copy',
      resolved.server.UUID,
      { path: file, target },
      req.ip,
    );

    jsonOk(res, { file, target });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/zip — Zip files
// ---------------------------------------------------------------------------
router.post('/zip', parseBody(zipBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const { files, target } = req.validatedBody as {
    files: string[];
    target: string;
  };

  try {
    // The daemon's zipname is the archive name (without extension); the
    // file-manager sends `target: "archive"`.
    const zipname = target.replace(/^.*\//, '').replace(/\.zip$/, '');
    const response = await daemonRequest(resolved.server.UUID, '/fs/zip', {
      method: 'POST',
      body: {
        id: resolved.server.UUID,
        path: files,
        zipname: zipname || 'archive',
      },
      timeout: DAEMON_TIMEOUT_FILE_HEAVY_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    logActivity(
      getAuthenticatedUserId(req),
      'file:zip',
      resolved.server.UUID,
      { count: files.length, zipname },
      req.ip,
    );

    jsonOk(res, { target, fileCount: files.length });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/unzip — Unzip file
// ---------------------------------------------------------------------------
router.post('/unzip', parseBody(unzipBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const { file, target } = req.validatedBody as {
    file: string;
    target?: string;
  };

  try {
    const response = await daemonRequest(resolved.server.UUID, '/fs/unzip', {
      method: 'POST',
      body: {
        id: resolved.server.UUID,
        path: target ?? '/',
        zipname: file,
      },
      timeout: DAEMON_TIMEOUT_FILE_HEAVY_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    logActivity(
      getAuthenticatedUserId(req),
      'file:unzip',
      resolved.server.UUID,
      { path: file, target: target ?? '/' },
      req.ip,
    );

    jsonOk(res, { file, target: target ?? '/' });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/upload — Upload file (JSON body)
//
// The page route has no multer, so the content arrives as a JSON string
// (plain UTF-8 or a `data:…;base64,` URI — both accepted by the daemon).
// ---------------------------------------------------------------------------
router.post('/upload', parseBody(uploadFileBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const input = req.validatedBody as {
    path?: string;
    fileName?: string;
    fileContent?: string;
    file?: string;
    content?: string;
  };

  const uploadPath = normalizeDirPath(input.path ?? '/');
  const fileName = input.fileName ?? input.file ?? '';
  const fileContent = input.fileContent ?? input.content ?? '';

  if (fileName.includes('/') || fileName.includes('..')) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid file name', 400);
  }

  try {
    const response = await daemonRequest(resolved.server.UUID, '/fs/upload', {
      method: 'POST',
      body: {
        id: resolved.server.UUID,
        path: uploadPath,
        fileName,
        fileContent,
      },
      timeout: DAEMON_TIMEOUT_FILE_HEAVY_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    const data = (await response.json().catch(() => null)) as {
      fileName?: string;
      path?: string;
    } | null;

    logActivity(
      getAuthenticatedUserId(req),
      'file:upload',
      resolved.server.UUID,
      { path: uploadPath, fileName, bytes: fileContent.length },
      req.ip,
    );

    jsonOk(res, {
      success: true,
      fileName: data?.fileName ?? fileName,
      path: data?.path ?? `${uploadPath}/${fileName}`,
    });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/pull — Pull from URL
// ---------------------------------------------------------------------------
router.post('/pull', parseBody(pullFileBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files.write')) {
    return;
  }

  const { url, path } = req.validatedBody as { url: string; path?: string };
  const target = normalizeDirPath(path ?? '/');

  try {
    const response = await daemonRequest(resolved.server.UUID, '/fs/pull', {
      method: 'POST',
      body: { id: resolved.server.UUID, url, path: target },
      timeout: DAEMON_TIMEOUT_FILE_HEAVY_MS,
    });

    if (!response.ok) {
      const message = await readDaemonError(response);
      return daemonFailure(res, response.status, message);
    }

    logActivity(
      getAuthenticatedUserId(req),
      'file:pull',
      resolved.server.UUID,
      { path: target },
      req.ip,
    );

    jsonOk(res, { status: 'pulling', message: 'File pulled.', path: target });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

export default router;
