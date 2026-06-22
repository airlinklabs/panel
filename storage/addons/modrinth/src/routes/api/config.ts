import { Router, Request, Response } from 'express';

interface ConfigDeps {
  settingsStore: any;
  createAdminMiddleware: () => any;
}

export function createConfigRoutes(deps: ConfigDeps): Router {
  const router = Router();
  const { settingsStore, createAdminMiddleware } = deps;

  router.get('/', createAdminMiddleware(), async (_req: Request, res: Response) => {
    try {
      const settings = await settingsStore.get();
      res.json({ success: true, data: settings });
    } catch {
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  });

  return router;
}
