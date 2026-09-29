import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
} from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const module: Module = {
  info: {
    name: 'Admin Nodes Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: 'Admin nodes management pages',
  },
  router: () => {
    const router = Router();

    // GET /admin/nodes — list nodes
    router.get(
      '/admin/nodes',
      isAuthenticated(true, 'airlink.admin.nodes.view'),
      async (req, res, next) => {
        try {
          const [nodesRes, locationsRes] = await Promise.all([
            apiGet(req, '/api/v2/admin/nodes') as Promise<any>,
            apiGet(req, '/api/v2/admin/locations') as Promise<any>,
          ]);
          res.render('admin/nodes/index', {
            nodes: nodesRes || [],
            meta: nodesRes.meta,
            locations: locationsRes || [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // GET /admin/nodes/list — lightweight JSON list for AJAX polling
    router.get(
      '/admin/nodes/list',
      isAuthenticated(true, 'airlink.admin.nodes.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(req, '/api/v2/admin/nodes')) as any;
          res.json(data || []);
        } catch (err) {
          next(err);
        }
      },
    );

    // GET /admin/nodes/create — create form
    router.get(
      '/admin/nodes/create',
      isAuthenticated(true, 'airlink.admin.nodes.view'),
      async (req, res, next) => {
        try {
          const [locationsRes, settingsRes] = await Promise.all([
            apiGet(req, '/api/v2/admin/locations') as Promise<any>,
            apiGet(req, '/api/v2/admin/settings') as Promise<any>,
          ]);
          res.render('admin/nodes/create', {
            locations: locationsRes || [],
            settings: settingsRes || {},
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // POST /admin/nodes/create — submit create
    router.post(
      '/admin/nodes/create',
      isAuthenticated(true, 'airlink.admin.nodes.create'),
      async (req, res, next) => {
        try {
          const result = (await apiPost(
            req,
            '/api/v2/admin/nodes',
            req.body,
          )) as any;
          res
            .status(200)
            .json({ message: 'Node created successfully.', node: result });
        } catch (err) {
          next(err);
        }
      },
    );

    // GET /admin/node/:id — edit form
    router.get(
      '/admin/node/:id',
      isAuthenticated(true, 'airlink.admin.nodes.view'),
      async (req, res, next) => {
        try {
          const [nodeRes, locationsRes, allocationsRes] = await Promise.all([
            apiGet(req, `/api/v2/admin/nodes/${req.params.id}`) as Promise<any>,
            apiGet(req, '/api/v2/admin/locations') as Promise<any>,
            apiGet(
              req,
              `/api/v2/admin/nodes/${req.params.id}/allocations`,
            ) as Promise<any>,
          ]);
          res.render('admin/nodes/edit', {
            node: nodeRes,
            locations: locationsRes || [],
            allocations: allocationsRes || [],
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // GET /admin/node/:id/configure — get configure command
    router.get(
      '/admin/node/:id/configure',
      isAuthenticated(true, 'airlink.admin.nodes.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(
            req,
            `/api/v2/admin/nodes/${req.params.id}/configure`,
          )) as any;
          const cfg = data;
          const command = `configure --panel "${process.env.URL || ''}" --key "${cfg.key}"`;
          res.status(200).json(command);
        } catch (err) {
          next(err);
        }
      },
    );

    // PUT /admin/node/:id/edit — submit edit
    router.put(
      '/admin/node/:id/edit',
      isAuthenticated(true, 'airlink.admin.nodes.update'),
      async (req, res, next) => {
        try {
          await apiPut(req, `/api/v2/admin/nodes/${req.params.id}`, req.body);
          res.status(200).json({ message: 'Node updated successfully.' });
        } catch (err) {
          next(err);
        }
      },
    );

    // DELETE /admin/node/:id — delete node
    router.delete(
      '/admin/node/:id',
      isAuthenticated(true, 'airlink.admin.nodes.delete'),
      async (req, res, next) => {
        try {
          await apiDelete(req, `/api/v2/admin/nodes/${req.params.id}`);
          res.status(200).json({ message: 'Node deleted successfully.' });
        } catch (err) {
          next(err);
        }
      },
    );

    // GET /admin/node/:id/stats — node stats page
    router.get(
      '/admin/node/:id/stats',
      isAuthenticated(true, 'airlink.admin.nodes.view'),
      async (req, res, next) => {
        try {
          const [nodeRes, statsRes] = await Promise.all([
            apiGet(req, `/api/v2/admin/nodes/${req.params.id}`) as Promise<any>,
            apiGet(
              req,
              `/api/v2/admin/nodes/${req.params.id}/stats`,
            ) as Promise<any>,
          ]);
          res.render('admin/nodes/stats', {
            node: nodeRes,
            stats: statsRes || {},
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    // GET /admin/node/:id/stats/live — live stats JSON
    router.get(
      '/admin/node/:id/stats/live',
      isAuthenticated(true, 'airlink.admin.nodes.view'),
      async (req, res, next) => {
        try {
          const data = (await apiGet(
            req,
            `/api/v2/admin/nodes/${req.params.id}/stats`,
          )) as any;
          res.json(data || {});
        } catch (err) {
          next(err);
        }
      },
    );

    // POST /admin/node/:id/maintenance — toggle maintenance
    router.post(
      '/admin/node/:id/maintenance',
      isAuthenticated(true, 'airlink.admin.nodes.update'),
      async (req, res, next) => {
        try {
          const result = (await apiPost(
            req,
            `/api/v2/admin/nodes/${req.params.id}/maintenance`,
            req.body,
          )) as any;
          res
            .status(200)
            .json({
              message: 'Node maintenance mode updated.',
              node: result,
            });
        } catch (err) {
          next(err);
        }
      },
    );

    // POST /admin/node/:id/verify — verify node
    router.post(
      '/admin/node/:id/verify',
      isAuthenticated(true, 'airlink.admin.nodes.view'),
      async (req, res, next) => {
        try {
          const result = (await apiPost(
            req,
            `/api/v2/admin/nodes/${req.params.id}/verify`,
            req.body,
          )) as any;
          res.status(200).json(result || { verified: false });
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
