import { Router, Request, Response } from 'express';

interface HealthDeps {
  modrinthClient: any;
  progressTracker: any;
}

export function createHealthRoutes(deps: HealthDeps): Router {
  const router = Router();
  const { modrinthClient, progressTracker } = deps;

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const health = await modrinthClient.healthCheck();
      res.json({
        success: true,
        status: health.healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        modrinth_api: health.accessible ? 'accessible' : 'limited',
        active_installations: progressTracker.getAllProgress().length,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, status: 'unhealthy', error: error.message });
    }
  });

  return router;
}
