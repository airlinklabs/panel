// ── Admin Page Route ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { resolveUser } from '../../utils/auth';

export function createAdminPage(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.redirect('/auth/login');
      if (!user.isAdmin) return res.status(403).send('Admin access required');

      const settings = await deps.settings.getAll();
      const isMobile = (req.session as any)?.device === 'mobile';

      // Get statistics
      let stats = { totalInstalls: 0, activeProjects: 0, blocked: 0 };
      try {
        const total = await deps.api.prisma.$queryRaw<{ count: number }[]>`
          SELECT COUNT(*) as count FROM ModrinthInstallation WHERE status = 'completed'
        `;
        stats.totalInstalls = Number(total[0]?.count ?? 0);

        const active = await deps.api.prisma.$queryRaw<{ count: number }[]>`
          SELECT COUNT(DISTINCT projectId) as count FROM ModrinthInstallation WHERE status = 'completed'
        `;
        stats.activeProjects = Number(active[0]?.count ?? 0);

        const blocked = settings.blockedProjects
          ? settings.blockedProjects.split(',').filter(s => s.trim()).length
          : 0;
        stats.blocked = blocked;
      } catch {
        // Non-critical
      }

      const data = {
        title: 'Modrinth Admin',
        user,
        settings,
        stats,
      };

      const html = await deps.api.renderView('admin.ejs', data, isMobile);
      res.send(html);
    } catch (error: any) {
      deps.api.logger.error(`Admin page error: ${error.message}`);
      res.status(500).send('Internal server error');
    }
  };
}
