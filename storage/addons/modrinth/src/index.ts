import { Router } from 'express';
import { ModrinthApiClient } from './modrinth-api';
import { CacheStore } from './cache';
import { SettingsStore } from './settings';
import { createRoutes } from './routes';
import type { AddonApi } from './types';

export default function (router: Router, api: AddonApi) {
  const { logger, prisma, ui } = api;

  logger.info('[Modrinth] Initializing...');

  const cache = new CacheStore(prisma);
  const modrinth = new ModrinthApiClient(cache, logger);
  const settings = new SettingsStore(api);

  ui.addSidebarItem({
    id: 'modrinth-store',
    label: 'Modrinth Store',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 mt-0.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    url: '/modrinth',
    section: 'navigation',
  });

  ui.addSidebarItem({
    id: 'modrinth-admin',
    label: 'Modrinth Admin',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 mt-0.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    url: '/modrinth/admin/config',
    section: 'admin',
    adminOnly: true,
  });

  const routes = createRoutes(api, modrinth, settings);
  router.use('/', routes);

  async function resolveUser(req: any): Promise<any> {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return null;
      return await prisma.users.findUnique({ where: { id: userId } });
    } catch { return null; }
  }

  router.get('/', async (req: any, res: any) => {
    try {
      const isMobile = req.session?.device === 'mobile';
      const user = await resolveUser(req);
      const s = await settings.get();
      const panelSettings = await prisma.settings.findUnique({ where: { id: 1 } });
      const query = (req.query.q as string) || '';
      const type = (req.query.type as string) || 'all';
      const index = (req.query.index as string) || 'relevance';
      const offset = parseInt(req.query.offset as string) || 0;

      let results: any = null;
      let totalHits = 0;

      if (query || type !== 'all') {
        try {
          const searchResult = await modrinth.search(query, type, 20, offset, index);
          results = searchResult;
          totalHits = searchResult.total_hits;
        } catch (err: any) {
          logger.error('[Modrinth] Search error:', err.message);
        }
      } else {
        try {
          const trending = await modrinth.search('', 'mod', 12, 0, 'downloads');
          results = trending;
          totalHits = trending.total_hits;
        } catch (err: any) {
          logger.error('[Modrinth] Trending error:', err.message);
        }
      }

      const html = await api.renderView('browse.ejs', {
        title: 'Browse',
        user: user || {},
        settings: s,
        panelTitle: panelSettings?.title || 'AirLink',
        nonce: res.locals.cspNonce || '',
        query,
        type,
        index,
        offset,
        results,
        totalHits,
      }, isMobile);
      res.send(html);
    } catch (err: any) {
      logger.error('[Modrinth] Browse render error:', err.message);
      res.status(500).send('Render error');
    }
  });

  router.get('/admin/config', async (req: any, res: any) => {
    try {
      const user = await resolveUser(req);
      if (!user || !user.isAdmin) {
        return res.status(403).send('Forbidden');
      }
      const isMobile = req.session?.device === 'mobile';
      const s = await settings.get();
      const panelSettings = await prisma.settings.findUnique({ where: { id: 1 } });
      const html = await api.renderView('admin.ejs', {
        title: 'Modrinth Settings',
        user,
        settings: s,
        panelTitle: panelSettings?.title || 'AirLink',
        nonce: res.locals.cspNonce || '',
      }, isMobile);
      res.send(html);
    } catch (err: any) {
      logger.error('[Modrinth] Admin render error:', err.message);
      res.status(500).send('Render error');
    }
  });

  router.get('/project/:id', async (req: any, res: any) => {
    try {
      const isMobile = req.session?.device === 'mobile';
      const user = await resolveUser(req);
      const project = await modrinth.getProject(req.params.id);
      let versions: any[] = [];
      if (project) {
        try { versions = await modrinth.getProjectVersions(project.id); } catch {}
      }
      const panelSettings = await prisma.settings.findUnique({ where: { id: 1 } });
      const html = await api.renderView('project.ejs', {
        title: project ? project.title : 'Project',
        user: user || {},
        project,
        versions,
        panelTitle: panelSettings?.title || 'AirLink',
        nonce: res.locals.cspNonce || '',
      }, isMobile);
      res.send(html);
    } catch (err: any) {
      logger.error('[Modrinth] Project render error:', err.message);
      res.status(500).send('Render error');
    }
  });

  logger.info('[Modrinth] Initialized');

  return {
    onInstall: () => { logger.info('[Modrinth] onInstall'); },
    onEnable: () => { logger.info('[Modrinth] onEnable'); },
    onDisable: () => { logger.info('[Modrinth] onDisable'); },
    onUpdate: (prev: string) => { logger.info(`[Modrinth] onUpdate from ${prev}`); },
    onUninstall: async () => {
      logger.info('[Modrinth] onUninstall - cleaning up');
      await cache.clear();
      await api.config.delete('showWarningBanner');
      await api.config.delete('warningTitle');
      await api.config.delete('warningMessage');
      await api.config.delete('disabledProjectTypes');
      await api.config.delete('blockedProjects');
    },
  };
}