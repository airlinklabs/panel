// ── Search History API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { resolveUser } from '../../utils/auth';

const MAX_HISTORY = 20;

export function createSearchHistoryApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      if (req.method === 'GET') {
        const raw = await deps.api.config.get(`searchHistory_${user.id}`);
        const history = raw ? JSON.parse(raw) : [];
        return res.json(history);
      }

      if (req.method === 'POST') {
        const { query } = req.body;
        if (!query || typeof query !== 'string') {
          return res.status(400).json({ error: 'Invalid query' });
        }

        const raw = await deps.api.config.get(`searchHistory_${user.id}`);
        const history: string[] = raw ? JSON.parse(raw) : [];
        const filtered = history.filter(q => q !== query);
        filtered.unshift(query);
        const trimmed = filtered.slice(0, MAX_HISTORY);
        await deps.api.config.set(`searchHistory_${user.id}`, JSON.stringify(trimmed));
        return res.json({ success: true, history: trimmed });
      }
    } catch (error: any) {
      deps.api.logger.error(`Search history API error: ${error.message}`);
      res.status(500).json({ error: 'Failed' });
    }
  };
}
