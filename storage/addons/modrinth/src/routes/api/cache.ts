import { Router, Request, Response } from 'express';

interface CacheDeps {
  cache: any;
  createAdminMiddleware: () => any;
}

export function createCacheRoutes(deps: CacheDeps): Router {
  const router = Router();
  const { cache, createAdminMiddleware } = deps;

  router.post('/clear', createAdminMiddleware(), async (_req: Request, res: Response) => {
    try {
      await cache.clear();
      res.json({ success: true, message: 'Cache cleared' });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to clear cache' });
    }
  });

  return router;
}
