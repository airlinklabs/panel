// ── Statistics API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';

export function createStatisticsApi(deps: RouteDeps) {
  return async (_req: Request, res: Response) => {
    try {
      const byType = await deps.api.prisma.$queryRaw<Array<{ projectType: string; count: number }>>`
        SELECT projectType, COUNT(*) as count
        FROM ModrinthInstallation
        WHERE status = 'completed'
        GROUP BY projectType
      `;

      const byStatus = await deps.api.prisma.$queryRaw<Array<{ status: string; count: number }>>`
        SELECT status, COUNT(*) as count
        FROM ModrinthInstallation
        GROUP BY status
      `;

      res.json({ byType, byStatus });
    } catch (error: any) {
      deps.api.logger.error(`Statistics API error: ${error.message}`);
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  };
}
