// ── Cache API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';

export function createCacheApi(deps: RouteDeps) {
  return async (_req: Request, res: Response) => {
    try {
      await deps.cache.clear();
      res.json({ success: true, message: 'Cache cleared' });
    } catch (error: any) {
      deps.api.logger.error(`Cache clear error: ${error.message}`);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  };
}
