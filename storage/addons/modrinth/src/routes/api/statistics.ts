import { Router, Request, Response } from 'express';

interface StatisticsDeps {
  prisma: any;
  createAdminMiddleware: () => any;
}

export function createStatisticsRoutes(deps: StatisticsDeps): Router {
  const router = Router();
  const { prisma, createAdminMiddleware } = deps;

  router.get('/', createAdminMiddleware(), async (_req: Request, res: Response) => {
    try {
      const [totalRows, projectRows, blockedRows] = await Promise.all([
        prisma.$queryRaw`SELECT COUNT(*) as count FROM ModrinthInstallation WHERE status = ${'completed'}`,
        prisma.$queryRaw`SELECT COUNT(DISTINCT projectId) as count FROM ModrinthInstallation WHERE status = ${'completed'}`,
        prisma.$queryRaw`SELECT COUNT(*) as count FROM ModrinthInstallation WHERE status IN (${'failed'}, ${'blocked'})`,
      ]);

      res.json({
        success: true,
        data: {
          totalInstallations: Number(totalRows[0]?.count || 0),
          activeProjects: Number(projectRows[0]?.count || 0),
          blockedInstallations: Number(blockedRows[0]?.count || 0),
        },
      });
    } catch {
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  });

  return router;
}
