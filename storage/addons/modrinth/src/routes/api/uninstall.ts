// ── Uninstall API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { isValidModrinthId, sanitizeServerId, isValidProjectType } from '../../utils/validation';
import { resolveUser, isServerOwner } from '../../utils/auth';

export function createUninstallApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const { serverId, projectId, projectName, projectType } = req.body;

      if (!sanitizeServerId(serverId)) return res.status(400).json({ error: 'Invalid server ID' });
      if (!isValidModrinthId(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

      const server = await deps.api.utils.getServerByUUID(serverId);
      if (!server) return res.status(404).json({ error: 'Server not found' });
      if (!isServerOwner(server, user.id) && !user.isAdmin) return res.status(403).json({ error: 'Access denied' });

      deps.daemon.configure(server);
      await deps.installer.uninstallMod(projectId, serverId, projectName || projectId, (projectType || 'mod') as any);

      res.json({ success: true, message: 'Mod uninstalled' });
    } catch (error: any) {
      deps.api.logger.error(`Uninstall API error: ${error.message}`);
      res.status(500).json({ error: error.message || 'Uninstall failed' });
    }
  };
}
