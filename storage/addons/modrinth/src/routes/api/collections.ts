// ── Collections API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { resolveUser } from '../../utils/auth';

export function createCollectionsApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      if (req.method === 'GET') {
        // Get user's collections from config
        const raw = await deps.api.config.get(`collections_${user.id}`);
        const collections = raw ? JSON.parse(raw) : [];
        return res.json(collections);
      }

      if (req.method === 'POST') {
        const { name, projectIds } = req.body;
        if (!name || !Array.isArray(projectIds)) {
          return res.status(400).json({ error: 'Invalid collection data' });
        }

        const raw = await deps.api.config.get(`collections_${user.id}`);
        const collections = raw ? JSON.parse(raw) : [];
        collections.push({
          id: Date.now().toString(36),
          name,
          projectIds,
          createdAt: new Date().toISOString(),
        });
        await deps.api.config.set(`collections_${user.id}`, JSON.stringify(collections));
        return res.json({ success: true, collections });
      }

      if (req.method === 'DELETE') {
        const { id } = req.params;
        const raw = await deps.api.config.get(`collections_${user.id}`);
        const collections = raw ? JSON.parse(raw) : [];
        const filtered = collections.filter((c: any) => c.id !== id);
        await deps.api.config.set(`collections_${user.id}`, JSON.stringify(filtered));
        return res.json({ success: true });
      }
    } catch (error: any) {
      deps.api.logger.error(`Collections API error: ${error.message}`);
      res.status(500).json({ error: 'Failed' });
    }
  };
}
