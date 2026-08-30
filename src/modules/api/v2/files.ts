/**
 * V2 API — Files endpoints.
 *
 * GET    /api/v2/servers/:id/files              — List files
 * GET    /api/v2/servers/:id/files/content       — Read file content
 * POST   /api/v2/servers/:id/files/content       — Write file content
 * DELETE /api/v2/servers/:id/files                — Delete file
 * POST   /api/v2/servers/:id/files/rename         — Rename file
 * POST   /api/v2/servers/:id/files/mkdir          — Create directory
 * POST   /api/v2/servers/:id/files/copy           — Copy file
 * POST   /api/v2/servers/:id/files/zip            — Zip files
 * POST   /api/v2/servers/:id/files/unzip          — Unzip file
 * POST   /api/v2/servers/:id/files/pull           — Git pull
 */

import { Router } from "express";
import { parseBody } from "../../../utils/validation";
import {
  jsonOk,
  jsonError,
  resolveServer,
  requireSubUserPermission,
  checkSuspended,
} from "./helpers";
import {
  writeFileBody,
  deleteFileBody,
  renameFileBody,
  mkdirBody,
  copyFileBody,
  zipBody,
  unzipBody,
} from './dto';
import { daemonRequest } from '../../../services/daemonService';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/files — List files
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
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

  const dirPath = (req.query.path as string) || '/';

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files?path=${encodeURIComponent(dirPath)}`,
      { timeout: 15000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    const data = await response.json();
    jsonOk(res, data);
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/files/content — Read file content
// ---------------------------------------------------------------------------
router.get("/content", async (req, res) => {
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

  const filePath = req.query.file as string;
  if (!filePath) {
    return jsonError(
      res,
      "BAD_REQUEST",
      "file query parameter is required",
      400,
    );
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files/content?path=${encodeURIComponent(filePath)}`,
      { timeout: 15000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    const data = await response.json();
    jsonOk(res, data);
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/content — Write file content
// ---------------------------------------------------------------------------
router.post("/content", parseBody(writeFileBody), async (req, res) => {
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
      `/servers/${resolved.server.UUID}/files/content`,
      { method: 'POST', body: { file, content }, timeout: 30000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    jsonOk(res, { file, written: content.length });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/files — Delete file
// ---------------------------------------------------------------------------
router.delete("/", parseBody(deleteFileBody), async (req, res) => {
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

  const { file } = req.validatedBody as { file: string };

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files`,
      { method: 'DELETE', body: { file }, timeout: 30000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    jsonOk(res, { deleted: file });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/rename — Rename file
// ---------------------------------------------------------------------------
router.post("/rename", parseBody(renameFileBody), async (req, res) => {
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
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files/rename`,
      { method: 'POST', body: { file, newname }, timeout: 15000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    jsonOk(res, { file, newname });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/mkdir — Create directory
// ---------------------------------------------------------------------------
router.post("/mkdir", parseBody(mkdirBody), async (req, res) => {
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

  const { name } = req.validatedBody as { name: string };

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files/mkdir`,
      { method: 'POST', body: { name }, timeout: 15000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    jsonOk(res, { name, created: true });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/copy — Copy file
// ---------------------------------------------------------------------------
router.post("/copy", parseBody(copyFileBody), async (req, res) => {
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
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files/copy`,
      { method: 'POST', body: { file, target }, timeout: 30000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    jsonOk(res, { file, target });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/zip — Zip files
// ---------------------------------------------------------------------------
router.post("/zip", parseBody(zipBody), async (req, res) => {
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
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files/zip`,
      { method: 'POST', body: { files, target }, timeout: 60000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    jsonOk(res, { target, fileCount: files.length });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/unzip — Unzip file
// ---------------------------------------------------------------------------
router.post("/unzip", parseBody(unzipBody), async (req, res) => {
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
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files/unzip`,
      { method: 'POST', body: { file, target }, timeout: 60000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    jsonOk(res, { file, target: target ?? "/" });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/files/pull — Git pull
// ---------------------------------------------------------------------------
router.post("/pull", async (req, res) => {
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

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/files/pull`,
      { method: 'POST', timeout: 60000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    jsonOk(res, { status: "pulling" });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

export default router;
