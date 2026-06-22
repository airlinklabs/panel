import { Router, Request, Response } from 'express';

interface ServersDeps {
  prisma: any;
}

export function createServersRoutes(deps: ServersDeps): Router {
  const router = Router();
  const { prisma } = deps;

  router.get('/', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const where = user.isAdmin ? {} : { ownerId: userId };
      const servers = await prisma.server.findMany({
        where,
        select: { UUID: true, name: true, description: true, Installing: true, Suspended: true },
        orderBy: { name: 'asc' },
        take: 100,
      });

      res.json({
        success: true,
        data: servers.map((s: any) => ({
          id: s.UUID,
          name: s.name,
          description: s.description || '',
          status: s.Installing ? 'installing' : s.Suspended ? 'suspended' : 'running',
        })),
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to get servers' });
    }
  });

  return router;
}
