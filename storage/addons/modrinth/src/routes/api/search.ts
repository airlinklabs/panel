import { Router, Request, Response } from 'express';
import { validateSearchQuery, validateProjectType, validatePageNumber } from '../../utils/validation';

interface SearchDeps {
  modrinthClient: any;
  settingsStore: any;
}

export function createSearchRoutes(deps: SearchDeps): Router {
  const router = Router();
  const { modrinthClient, settingsStore } = deps;

  router.get('/', async (req: Request, res: Response) => {
    try {
      const query = String(req.query.q || '').trim();
      const type = String(req.query.type || 'all').trim();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);

      const effectiveQuery = query || 'minecraft';
      const queryValidation = validateSearchQuery(effectiveQuery);
      if (!queryValidation.valid) {
        return res.status(400).json({ success: false, error: queryValidation.error });
      }

      const effectiveType = type === 'all' ? '' : type;
      const typeValidation = validateProjectType(type);
      if (!typeValidation.valid) {
        return res.status(400).json({ success: false, error: typeValidation.error });
      }

      const results = await modrinthClient.search(effectiveQuery, effectiveType, page);
      const filteredHits = results?.hits ? await settingsStore.filterProjects(results.hits) : [];

      res.json({
        success: true,
        data: { ...results, hits: filteredHits, total_hits: filteredHits.length },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Search failed' });
    }
  });

  return router;
}
