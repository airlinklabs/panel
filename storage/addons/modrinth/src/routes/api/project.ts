import { Router, Request, Response } from 'express';
import { validateProjectId } from '../../utils/validation';

interface ProjectDeps {
  modrinthClient: any;
}

export function createProjectApiRoutes(deps: ProjectDeps): Router {
  const router = Router();
  const { modrinthClient } = deps;

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();
      const validation = validateProjectId(id);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      const [project, versions] = await Promise.all([
        modrinthClient.getProject(id),
        modrinthClient.getProjectVersions(id),
      ]);

      res.json({ success: true, data: { project, versions } });
    } catch (error: any) {
      if (error.response?.status === 404) {
        res.status(404).json({ success: false, error: 'Project not found' });
      } else {
        res.status(500).json({ success: false, error: 'Failed to get project' });
      }
    }
  });

  return router;
}
