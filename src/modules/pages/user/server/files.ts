import { Router } from 'express';
import {
  isAuthenticatedForServer,
  requireSubUserPermission,
} from '../../../../handlers/utils/auth/serverAuthUtil';
import { apiGet, apiPost } from '../../../../handlers/internalApiClient';
import type { Module } from '../../../../handlers/moduleInit';

/**
 * Express types the named wildcard (`*path`) as `string | string[]`; the v2
 * API takes a plain path, so normalise once here.
 */
function splatPath(params: { path?: string | string[] }): string {
  const raw = params.path;
  return Array.isArray(raw) ? raw.join('/') : (raw ?? '');
}

const module: Module = {
  info: {
    name: 'User Server Files',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: 'File browser and editor for user servers',
  },
  router: () => {
    const router = Router();

    // ── File browser ─────────────────────────────────────────────────────
    router.get(
      '/server/:id/files',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(
            req,
            `/servers/${req.params.id}/files`,
          )) as Record<string, unknown>;
          res.render('user/server/files', {
            ...data,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── File listing (JSON) ──────────────────────────────────────────────
    router.get(
      '/server/:id/files/list',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiGet(
            req,
            `/servers/${req.params.id}/files`,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── File editor ──────────────────────────────────────────────────────
    router.get(
      '/server/:id/files/edit/*path',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const filePath = splatPath(req.params);
          const data = (await apiGet(
            req,
            `/servers/${req.params.id}/files/content?file=${encodeURIComponent(filePath)}`,
          )) as Record<string, unknown>;
          res.render('user/server/file', {
            ...data,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Download file ────────────────────────────────────────────────────
    router.get(
      '/server/:id/files/download/*path',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const filePath = splatPath(req.params);
          const data = (await apiGet(
            req,
            `/servers/${req.params.id}/files/download?file=${encodeURIComponent(filePath)}`,
          )) as { url?: string };
          // `<a href>` downloads — hand the browser the daemon URL instead of
          // dumping `{file, token, url}` JSON into the page.
          res.redirect(data.url || '/');
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Delete file/dir (proxy — body forwarded to v2) ───────────────────
    router.post(
      '/server/:id/files/rm',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/action`,
            { action: 'delete', ...req.body },
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Save file ────────────────────────────────────────────────────────
    router.post(
      '/server/:id/files/*path',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const filePath = splatPath(req.params);
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/content`,
            { file: filePath, content: req.body.content },
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Create directory ─────────────────────────────────────────────────
    router.post(
      '/server/:id/files/mkdir',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/mkdir`,
            req.body,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Rename file ──────────────────────────────────────────────────────
    router.post(
      '/server/:id/files/rename',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/rename`,
            req.body,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Copy file ────────────────────────────────────────────────────────
    router.post(
      '/server/:id/files/copy',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/copy`,
            req.body,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Pull from URL ────────────────────────────────────────────────────
    router.post(
      '/server/:id/files/pull',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/pull`,
            req.body,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Upload file(s) ───────────────────────────────────────────────────
    router.post(
      '/server/:id/upload',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/upload`,
            req.body,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Create zip ───────────────────────────────────────────────────────
    router.post(
      '/server/:id/zip',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/zip`,
            req.body,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    // ── Extract zip ──────────────────────────────────────────────────────
    router.post(
      '/server/:id/unzip',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files'),
      async (req, res, next) => {
        try {
          const data = await apiPost(
            req,
            `/servers/${req.params.id}/files/unzip`,
            req.body,
          );
          res.json(data);
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
