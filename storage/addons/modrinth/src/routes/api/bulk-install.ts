// ── Bulk Install API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { isValidModrinthId, sanitizeServerId } from '../../utils/validation';
import { resolveUser, isServerOwner } from '../../utils/auth';

export function createBulkInstallApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const { serverId, installs } = req.body;
      if (!sanitizeServerId(serverId)) return res.status(400).json({ error: 'Invalid server ID' });
      if (!Array.isArray(installs) || installs.length === 0) {
        return res.status(400).json({ error: 'No installs provided' });
      }

      const server = await deps.api.utils.getServerByUUID(serverId);
      if (!server) return res.status(404).json({ error: 'Server not found' });
      if (!isServerOwner(server, user.id) && !user.isAdmin) return res.status(403).json({ error: 'Access denied' });

      deps.daemon.configure(server);

      const results: Array<{ projectId: string; success: boolean; error?: string }> = [];

      for (const install of installs) {
        if (!isValidModrinthId(install.projectId) || !isValidModrinthId(install.versionId)) {
          results.push({ projectId: install.projectId, success: false, error: 'Invalid ID' });
          continue;
        }

        try {
          const project = await deps.modrinth.getProject(install.projectId);
          const version = await deps.modrinth.getVersion(install.versionId);

          if (project.project_type === 'modpack') {
            const primaryFile = version.files.find(f => f.primary) ?? version.files[0];
            if (!primaryFile) {
              results.push({ projectId: install.projectId, success: false, error: 'No files' });
              continue;
            }
            const buffer = await deps.modrinth.downloadFile(primaryFile.url);
            await deps.installer.installModpack(buffer, project, version, server);
          } else {
            await deps.installer.installSingleFile(project, version, server);
          }
          results.push({ projectId: install.projectId, success: true });
        } catch (error: any) {
          results.push({ projectId: install.projectId, success: false, error: error.message });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      deps.api.logger.error(`Bulk install API error: ${error.message}`);
      res.status(500).json({ error: 'Bulk install failed' });
    }
  };
}
