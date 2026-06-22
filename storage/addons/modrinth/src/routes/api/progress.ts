import { Router, Request, Response } from 'express';

interface ProgressDeps {
  progressTracker: any;
  createAuthMiddleware: () => any;
}

export function createProgressRoutes(deps: ProgressDeps): Router {
  const router = Router();
  const { progressTracker, createAuthMiddleware } = deps;
  const isAuthenticated = createAuthMiddleware();

  router.get('/:serverId/:projectId', async (req: Request, res: Response) => {
    try {
      const serverId = String(req.params.serverId || '');
      const projectId = String(req.params.projectId || '');
      const progress = progressTracker.getProgress(serverId, projectId);

      if (!progress) {
        return res.json({ success: true, active: false, message: 'No active installation' });
      }

      res.json({ success: true, active: true, data: progressTracker.serializeProgress(progress) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const all = progressTracker.getAllProgress();
      res.json({
        success: true,
        active: all.length > 0,
        installations: all.map((p: any) => progressTracker.serializeProgress(p)),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.delete('/:serverId/:projectId', isAuthenticated('serverId'), async (req: Request, res: Response) => {
    try {
      const serverId = String(req.params.serverId || '');
      const projectId = String(req.params.projectId || '');
      progressTracker.clearProgress(serverId, projectId);
      res.json({ success: true, message: 'Progress cleared' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
