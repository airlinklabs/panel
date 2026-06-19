// ── Health API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';

export function createHealthApi(deps: RouteDeps) {
  return async (_req: Request, res: Response) => {
    try {
      const modrinthHealthy = await deps.modrinth.healthCheck();
      res.json({
        modrinth: modrinthHealthy ? 'healthy' : 'unreachable',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.json({ modrinth: 'error', error: error.message });
    }
  };
}
