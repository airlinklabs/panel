import { Router, Request, Response } from 'express';
import { validateServerId } from '../../utils/validation';

interface InstallationsDeps {
  prisma: any;
  createAuthMiddleware: () => any;
}

export function createInstallationsRoutes(deps: InstallationsDeps): Router {
  const router = Router();
  const { prisma, createAuthMiddleware } = deps;
  const isAuthenticated = createAuthMiddleware();

  router.get('/:serverId', isAuthenticated('serverId'), async (req: Request, res: Response) => {
    try {
      const serverId = String(req.params.serverId || '');
      const validation = validateServerId(serverId);
      if (!validation.valid) return res.status(400).json({ success: false, error: validation.error });

      const rows = await prisma.$queryRaw`
        SELECT * FROM ModrinthInstallation
        WHERE serverId = ${serverId}
        ORDER BY id DESC LIMIT 50
      `;

      res.json({ success: true, data: rows || [] });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to get installations' });
    }
  });

  router.get('/', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user?.isAdmin) return res.status(403).json({ success: false, error: 'Admin required' });

      const rows = await prisma.$queryRaw`SELECT * FROM ModrinthInstallation ORDER BY id DESC LIMIT 100`;
      res.json({ success: true, data: { installations: rows || [] } });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to get installations' });
    }
  });

  return router;
}
