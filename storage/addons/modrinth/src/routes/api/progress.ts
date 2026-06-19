// ── Progress API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { progressTracker } from '../../lib/progress-tracker';

export function createProgressApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      // DELETE — remove a progress entry
      if (req.method === 'DELETE') {
        const { serverId, projectId } = req.params;
        progressTracker.remove(String(serverId), String(projectId));
        return res.json({ success: true });
      }

      // GET with params — single installation progress
      if (req.params.serverId && req.params.projectId) {
        const progress = progressTracker.get(String(req.params.serverId), String(req.params.projectId));
        if (!progress) return res.status(404).json({ error: 'Installation not found' });
        return res.json(progress);
      }

      // GET all — all active installations
      const all = progressTracker.getAll();
      res.json(all);
    } catch (error: any) {
      deps.api.logger.error(`Progress API error: ${error.message}`);
      res.status(500).json({ error: 'Failed to get progress' });
    }
  };
}
