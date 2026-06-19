// ── Installed Page Route ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { resolveUser, isServerOwner } from '../../utils/auth';
import { sanitizeServerId } from '../../utils/validation';

export function createInstalledPage(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.redirect('/auth/login');

      const serverId = sanitizeServerId(req.params.serverId as string);
      if (!serverId) {
        return res.status(400).send('Invalid server ID');
      }

      // Get server and check ownership
      const server = await deps.api.utils.getServerByUUID(serverId);
      if (!server) {
        return res.status(404).send('Server not found');
      }

      if (!isServerOwner(server, user.id) && !user.isAdmin) {
        return res.status(403).send('Access denied');
      }

      // Get installations for this server
      let installations: any[] = [];
      try {
        installations = await deps.api.prisma.$queryRaw<any[]>`
          SELECT * FROM ModrinthInstallation
          WHERE serverId = ${serverId}
          ORDER BY installedAt DESC
        `;
      } catch {
        // Table might not exist yet
      }

      // Check for updates
      let updates: any[] = [];
      try {
        updates = await deps.updateChecker.checkForServer(serverId);
      } catch {
        // Non-critical
      }

      const settings = await deps.settings.getAll();
      const isMobile = (req.session as any)?.device === 'mobile';

      const data = {
        title: 'Installed Mods',
        user,
        server,
        installations,
        updates,
        settings,
      };

      const html = await deps.api.renderView('installed.ejs', data, isMobile);
      res.send(html);
    } catch (error: any) {
      deps.api.logger.error(`Installed page error: ${error.message}`);
      res.status(500).send('Internal server error');
    }
  };
}
