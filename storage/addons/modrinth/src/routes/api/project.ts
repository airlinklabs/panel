// ── Project API ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import type { ModrinthVersion } from '../../types/modrinth';
import { isValidModrinthId } from '../../utils/validation';

export function createProjectApi(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id as string;
      if (!isValidModrinthId(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }

      const project = await deps.modrinth.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      let versions: ModrinthVersion[] = [];
      try {
        versions = await deps.modrinth.getProjectVersions(projectId);
      } catch {
        versions = [];
      }

      const isBlocked = await deps.settings.isProjectBlocked(project.id);

      res.json({ project, versions, isBlocked });
    } catch (error: any) {
      deps.api.logger.error(`Project API error: ${error.message}`);
      if (error.message.includes('404') || error.message.includes('not found')) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  };
}
