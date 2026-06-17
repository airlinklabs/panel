import { Router } from 'express';
import path from 'path';

export default function (router: Router, api: any) {
  const { logger, prisma, config, permissions, commands, schedule, ui, middleware } = api;

  logger.info('[Reference Addon] Initializing...');

  permissions.register('addon.reference-addon.view');
  permissions.register('addon.reference-addon.manage');

  commands.register({
    name: 'hello',
    description: 'Prints a greeting message',
    handler: async () => {
      const greeting = await config.get('greeting') || 'Hello from Reference Addon!';
      return greeting;
    },
  });

  commands.register({
    name: 'count-items',
    description: 'Counts items in the reference table',
    handler: async () => {
      const result = await prisma.$queryRaw`SELECT COUNT(*) as count FROM ReferenceItems`;
      return `Item count: ${(result as any[])[0]?.count ?? 0}`;
    },
  });

  schedule.register({
    id: 'cleanup-old-items',
    intervalMs: 60 * 60 * 1000,
    handler: async () => {
      logger.info('[Reference Addon] Running scheduled cleanup...');
      const maxItems = parseInt((await config.get('maxItems')) || '10', 10);
      const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM ReferenceItems`;
      const total = (count as any[])[0]?.count ?? 0;
      if (total > maxItems) {
        await prisma.$executeRaw`DELETE FROM ReferenceItems WHERE id NOT IN (SELECT id FROM ReferenceItems ORDER BY createdAt DESC LIMIT ${maxItems})`;
        logger.info(`[Reference Addon] Cleaned up items, kept ${maxItems}`);
      }
    },
  });

  ui.registerSlot('dashboard.home.afterContent', async (locals) => {
    const greeting = await config.get('greeting') || 'Hello from Reference Addon!';
    return `<div class="mx-8 mt-4 rounded-xl bg-neutral-900 p-4 border border-neutral-800">
      <p class="text-sm text-neutral-300">${greeting}</p>
    </div>`;
  });

  ui.registerSlot('admin.addons.afterContent', (locals) => {
    return `<div class="mx-8 mt-4 rounded-xl bg-neutral-900 p-4 border border-neutral-800">
      <p class="text-sm text-neutral-400">This content is injected by the Reference Addon via the admin.addons.afterContent slot.</p>
    </div>`;
  });

  ui.registerDashboardWrapper(async (locals) => {
    return `<div id="reference-addon-wrapper" data-addon="reference-addon"></div>`;
  });

  router.get('/', async (req: any, res: any) => {
    try {
      const user = req.session?.user;
      if (!user) return res.redirect('/login');

      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      const greeting = await config.get('greeting') || 'Hello from Reference Addon!';
      const maxItems = parseInt((await config.get('maxItems')) || '10', 10);
      const enableNotifications = (await config.get('enableNotifications')) !== 'false';

      let items: any[] = [];
      try {
        items = await prisma.$queryRaw`SELECT * FROM ReferenceItems ORDER BY createdAt DESC LIMIT ${maxItems}`;
      } catch {
        // Table might not exist yet
      }

      res.render(path.join(api.viewsPath, 'index.ejs'), {
        user,
        req,
        settings,
        greeting,
        items,
        enableNotifications,
        maxItems,
        components: {
          header: api.getComponentPath('views/components/header'),
          template: api.getComponentPath('views/components/template'),
          footer: api.getComponentPath('views/components/footer'),
        },
      });
    } catch (error: any) {
      logger.error('[Reference Addon] Error rendering page:', error.message);
      res.status(500).send('Internal Server Error');
    }
  });

  router.post('/add', async (req: any, res: any) => {
    try {
      const user = req.session?.user;
      if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

      const { name, description } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Name is required' });

      await prisma.$executeRaw`INSERT INTO ReferenceItems (name, description) VALUES (${name}, ${description || ''})`;

      const enableNotifications = (await config.get('enableNotifications')) !== 'false';
      if (enableNotifications) {
        logger.info(`[Reference Addon] Item "${name}" created by ${user.username}`);
      }

      res.redirect('/reference-addon');
    } catch (error: any) {
      logger.error('[Reference Addon] Error adding item:', error.message);
      res.status(500).json({ success: false, error: 'Failed to add item' });
    }
  });

  router.post('/delete/:id', async (req: any, res: any) => {
    try {
      const user = req.session?.user;
      if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

      await prisma.$executeRaw`DELETE FROM ReferenceItems WHERE id = ${id}`;
      res.redirect('/reference-addon');
    } catch (error: any) {
      logger.error('[Reference Addon] Error deleting item:', error.message);
      res.status(500).json({ success: false, error: 'Failed to delete item' });
    }
  });

  const apiRouter = Router();
  apiRouter.get('/items', middleware.apiValidator('addon.reference-addon.view'), async (req: any, res: any) => {
    try {
      const items = await prisma.$queryRaw`SELECT * FROM ReferenceItems ORDER BY createdAt DESC`;
      res.json({ success: true, items });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  api.registerRoute('/reference-addon/api', apiRouter);

  logger.info('[Reference Addon] Initialized successfully');

  return {
    onInstall: () => {
      logger.info('[Reference Addon] onInstall hook called');
    },
    onEnable: () => {
      logger.info('[Reference Addon] onEnable hook called');
    },
    onDisable: () => {
      logger.info('[Reference Addon] onDisable hook called');
    },
    onUpdate: (previousVersion: string) => {
      logger.info(`[Reference Addon] onUpdate hook called, previous version: ${previousVersion}`);
    },
    onUninstall: async () => {
      logger.info('[Reference Addon] onUninstall hook called - cleaning up...');
      await config.deleteAll();
      logger.info('[Reference Addon] Cleanup complete');
    },
  };
}
