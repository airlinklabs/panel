import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import { hasPermission } from '../../../handlers/utils/auth/roles';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
} from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

// Note: API payloads are handed to EJS as named locals only — never spread
// into res.render. EJS reserves `settings`/`filename` internally (passing a
// subsystem's row as `settings` would shadow the global one layouts/base.ejs
// reads for theme/logo) and circular objects blow up the render.

const module: Module = {
  info: {
    name: 'Admin Servers Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    // -----------------------------------------------------------------------
    // GET /admin/servers — List servers (+ Queue and Radar tabs)
    // -----------------------------------------------------------------------
    router.get(
      '/admin/servers',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req, res, next) => {
        try {
          const page = req.query.page || '1';
          const perPage = req.query.perPage || '25';
          const search = req.query.search || '';
          const qs = `?page=${page}&perPage=${perPage}${search ? `&search=${search}` : ''}`;

          // Radar rides along on this page but keeps its own gate: the old
          // /admin/radar route required airlink.admin.radar.view, so the tab
          // is only rendered for admins that still hold it. An empty
          // permissions list means unrestricted admin (same rule the
          // isAuthenticated middleware applies).
          const perms = req.panelUser?.permissions;
          const userPerms: string[] = Array.isArray(perms)
            ? (perms as unknown as string[])
            : [];
          const showRadar =
            userPerms.length === 0 ||
            hasPermission(userPerms, 'airlink.admin.radar.view');

          // Queue reuses this route's permission, so no extra gate — but the
          // queue read must never take the whole page down.
          //
          // No radar fetch: the Radar tab's markup is entirely static (server
          // scan form, static history placeholder, VT hash lookup) — the old
          // /admin/radar page only consumed its payload for the VirusTotal
          // settings card, which Settings already owns. Fetching it here would
          // be a wasted round trip and, worse, passing its `settings` row as a
          // render local would shadow res.locals.settings that layouts/base.ejs
          // reads for theme/logo.
          const [result, queueData] = await Promise.all([
            apiGet(req, `/api/v2/admin/servers${qs}`),
            apiGet(req, '/admin/queue').catch(() => []),
          ]);
          const servers = (result as any) || [];

          res.render('admin/servers/servers', {
            servers,
            meta: servers.meta,
            entries: Array.isArray(queueData) ? queueData : [],
            showRadar,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/servers/create — Create form
    // -----------------------------------------------------------------------
    router.get(
      '/admin/servers/create',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req, res, next) => {
        try {
          const [usersRes, nodesRes, imagesRes, settingsRes] =
            await Promise.all([
              apiGet(req, '/api/v2/admin/users?perPage=9999'),
              apiGet(req, '/api/v2/admin/nodes/list'),
              apiGet(req, '/api/v2/admin/images/list'),
              apiGet(req, '/api/v2/admin/settings'),
            ]);
          const usersData = (usersRes as any) || [];
          const nodesData = (nodesRes as any) || [];
          const imagesData = (imagesRes as any) || [];
          const settingsObj = (settingsRes as any) || {};
          res.render('admin/servers/create', {
            users: usersData,
            nodes: nodesData,
            images: imagesData,
            settings: settingsObj,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/servers/create — Submit create (PRG)
    // -----------------------------------------------------------------------
    router.post(
      '/admin/servers/create',
      isAuthenticated(true, 'airlink.admin.servers.create'),
      async (req, res, next) => {
        try {
          await apiPost(req, '/api/v2/admin/servers', req.body);
          req.session.flash = {
            type: 'success',
            message: 'Server created successfully.',
          };
          res.redirect('/admin/servers');
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/servers/edit/:id — Edit form
    // -----------------------------------------------------------------------
    router.get(
      '/admin/servers/edit/:id',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req, res, next) => {
        try {
          const [serverRes, usersRes, nodesRes, imagesRes, settingsRes] =
            await Promise.all([
              apiGet(req, `/api/v2/admin/servers/${req.params.id}`),
              apiGet(req, '/api/v2/admin/users?perPage=9999'),
              apiGet(req, '/api/v2/admin/nodes/list'),
              apiGet(req, '/api/v2/admin/images/list'),
              apiGet(req, '/api/v2/admin/settings'),
            ]);
          const server = (serverRes as any);
          if (!server) {
            req.session.flash = {
              type: 'error',
              message: 'Server not found.',
            };
            return res.redirect('/admin/servers');
          }
          const usersData = (usersRes as any) || [];
          const nodesData = (nodesRes as any) || [];
          const imagesData = (imagesRes as any) || [];
          const settingsObj = (settingsRes as any) || {};
          res.render('admin/servers/edit', {
            server,
            users: usersData,
            nodes: nodesData,
            images: imagesData,
            settings: settingsObj,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/servers/edit/:id — Submit edit (PRG)
    // -----------------------------------------------------------------------
    router.post(
      '/admin/servers/edit/:id',
      isAuthenticated(true, 'airlink.admin.servers.update'),
      async (req, res, next) => {
        try {
          await apiPut(req, `/api/v2/admin/servers/${req.params.id}`, req.body);
          req.session.flash = {
            type: 'success',
            message: 'Server updated successfully.',
          };
          res.redirect('/admin/servers');
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/server/delete/:id — Delete server (PRG)
    // -----------------------------------------------------------------------
    router.post(
      '/admin/server/delete/:id',
      isAuthenticated(true, 'airlink.admin.servers.delete'),
      async (req, res, next) => {
        try {
          await apiDelete(req, `/api/v2/admin/servers/${req.params.id}`);
          req.session.flash = {
            type: 'success',
            message: 'Server deleted successfully.',
          };
          res.redirect('/admin/servers');
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/servers/:id/suspend — Suspend (JSON for JS callers)
    // -----------------------------------------------------------------------
    router.post(
      '/admin/servers/:id/suspend',
      isAuthenticated(true, 'airlink.admin.servers.update'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/servers/${req.params.id}/suspend`,
            req.body,
          );
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/servers/:id/unsuspend — Unsuspend (JSON for JS callers)
    // -----------------------------------------------------------------------
    router.post(
      '/admin/servers/:id/unsuspend',
      isAuthenticated(true, 'airlink.admin.servers.update'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/servers/${req.params.id}/unsuspend`,
            req.body,
          );
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // POST /admin/servers/:id/transfer — Transfer (JSON for JS callers)
    // -----------------------------------------------------------------------
    router.post(
      '/admin/servers/:id/transfer',
      isAuthenticated(true, 'airlink.admin.servers.update'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/servers/${req.params.id}/transfer`,
            req.body,
          );
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // GET /admin/servers/:id/transfer/status — Transfer poll (JSON)
    // -----------------------------------------------------------------------
    router.get(
      '/admin/servers/:id/transfer/status',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req, res, next) => {
        try {
          const status = await apiGet(
            req,
            `/api/v2/admin/servers/${req.params.id}/transfer/status`,
          );
          res.json(status);
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
