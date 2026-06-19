// ── Install API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import { isValidModrinthId, sanitizeServerId } from '../../utils/validation';
import { resolveUser, isServerOwner } from '../../utils/auth';
import { progressTracker } from '../../lib/progress-tracker';

export function createInstallApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const { serverId, projectId, versionId } = req.body;

      if (!sanitizeServerId(serverId)) {
        return res.status(400).json({ error: 'Invalid server ID' });
      }
      if (!isValidModrinthId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      if (!isValidModrinthId(versionId)) {
        return res.status(400).json({ error: 'Invalid version ID' });
      }

      // Check server ownership
      const server = await deps.api.utils.getServerByUUID(serverId);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      if (!isServerOwner(server, user.id) && !user.isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check if project is blocked
      if (await deps.settings.isProjectBlocked(projectId)) {
        return res.status(403).json({ error: 'This project is blocked' });
      }

      // Check if project type is disabled
      const project = await deps.modrinth.getProject(projectId);
      if (await deps.settings.isProjectTypeDisabled(project.project_type)) {
        return res.status(403).json({ error: 'This project type is disabled' });
      }

      const version = await deps.modrinth.getVersion(versionId);
      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      // Check for existing in-progress installation
      const existing = progressTracker.get(serverId, projectId);
      if (existing && existing.stage !== 'completed' && existing.stage !== 'failed') {
        return res.status(409).json({ error: 'Installation already in progress' });
      }

      // Configure daemon client for this server
      deps.daemon.configure(server);

      // Start installation in background
      const isModpack = project.project_type === 'modpack';

      if (isModpack) {
        // Download the modpack file first
        const primaryFile = version.files.find(f => f.primary) ?? version.files[0];
        if (!primaryFile) {
          return res.status(400).json({ error: 'No files in version' });
        }

        const buffer = await deps.modrinth.downloadFile(primaryFile.url);
        deps.installer.installModpack(buffer, project, version, server).catch(err => {
          deps.api.logger.error(`Modpack install failed: ${err.message}`);
        });
      } else {
        deps.installer.installSingleFile(project, version, server).catch(err => {
          deps.api.logger.error(`Single file install failed: ${err.message}`);
        });
      }

      res.json({ success: true, message: 'Installation started' });
    } catch (error: any) {
      deps.api.logger.error(`Install API error: ${error.message}`);
      res.status(500).json({ error: 'Installation failed' });
    }
  };
}
