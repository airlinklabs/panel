// ── Project Page Route ──

import type { Request, Response } from 'express';
import type { RouteDeps } from '../index';
import type { ModrinthVersion } from '../../types/modrinth';
import { resolveUser } from '../../utils/auth';
import { isValidModrinthId } from '../../utils/validation';

export function createProjectPage(deps: RouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const user = await resolveUser(deps.api, req);
      if (!user) return res.redirect('/auth/login');

      const projectId = req.params.id as string;
      if (!isValidModrinthId(projectId)) {
        return res.status(400).send('Invalid project ID');
      }

      const project = await deps.modrinth.getProject(projectId);
      if (!project) {
        return res.status(404).send('Project not found');
      }

      let versions: ModrinthVersion[] = [];
      try {
        versions = await deps.modrinth.getProjectVersions(projectId);
      } catch {
        versions = [];
      }

      const isBlocked = await deps.settings.isProjectBlocked(project.id);
      const settings = await deps.settings.getAll();
      const isMobile = (req.session as any)?.device === 'mobile';

      const data = {
        title: project.title,
        user,
        project,
        versions,
        isBlocked,
        settings,
      };

      const html = await deps.api.renderView('project.ejs', data, isMobile);
      res.send(html);
    } catch (error: any) {
      deps.api.logger.error(`Project page error: ${error.message}`);
      if (error.message.includes('404') || error.message.includes('not found')) {
        return res.status(404).send('Project not found');
      }
      res.status(500).send('Internal server error');
    }
  };
}
