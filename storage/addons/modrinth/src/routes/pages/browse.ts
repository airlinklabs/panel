import { Router, Request, Response } from 'express';
import path from 'path';
import { SettingsStore } from '../../lib/settings-store';

interface BrowseDeps {
  modrinthClient: any;
  settingsStore: SettingsStore;
  prisma: any;
  getComponent: (name: string, viewport?: string) => string | null;
  getComponents: (viewport?: string) => Record<string, string>;
}

export function createBrowseRoutes(deps: BrowseDeps): Router {
  const router = Router();
  const { modrinthClient, settingsStore, prisma, getComponent, getComponents } = deps;

  router.get('/', async (req: Request, res: Response) => {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect('/login');

    try {
      const query = String(req.query.q || '').trim();
      const type = String(req.query.type || 'all');
      const page = Math.max(1, parseInt(req.query.page as string) || 1);

      const [user, globalSettings, modrinthSettings] = await Promise.all([
        prisma.users.findUnique({ where: { id: userId } }),
        prisma.settings.findFirst().catch(() => null) || { title: 'Control Panel', logo: '/assets/logo.png', theme: 'dark' },
        settingsStore.get(),
      ]);

      const rawResults = await modrinthClient.search(query || 'minecraft', type === 'all' ? '' : type || '', page);
      const filteredHits = rawResults?.hits ? await settingsStore.filterProjects(rawResults.hits) : [];

      const isMobile = (req as any).cookies?.viewport_mode === 'mobile';
      const viewport = isMobile ? 'mobile' : 'desktop';
      const components = getComponents(viewport);

      res.render(path.join(__dirname, `../../../views/${viewport}/browse.ejs`), {
        title: 'Modrinth Store',
        user, req, settings: globalSettings, modrinthSettings,
        query, type, page,
        results: { ...rawResults, hits: filteredHits, total_hits: filteredHits.length },
        totalPages: Math.ceil(filteredHits.length / 20),
        mods: filteredHits,
        featuredMods: filteredHits.slice(0, 5),
        components,
      });
    } catch (error) {
      console.error('Error in browse page:', error);
      res.status(500).json({ error: 'Failed to load page' });
    }
  });

  return router;
}
