/**
 * Test Addon for AirLink Panel
 *
 * This is a simple test addon.
 */

import { Router } from 'express';
import path from 'path';

interface AddonAPI {
  registerRoute: (path: string, router: Router) => void;
  logger: any;
  prisma: any;
  addonPath: string;
  viewsPath: string;
  renderView: (viewName: string, data?: any) => string;
  getComponentPath: (componentPath: string) => string;
  utils?: {
    isUserAdmin?: (userId: number) => Promise<boolean>;
    checkServerAccess?: (userId: number, serverId: number) => Promise<boolean>;
  };
}

export default function(router: Router, api: AddonAPI) {
  const { logger, prisma } = api;

  logger.info('Test Addon initialized');

  router.get('/', async (req: any, res: any) => {
    try {
      const userCount = await prisma.users.count();
      const serverCount = await prisma.server.count();
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });

      res.render(path.join(api.viewsPath, 'test-addon.ejs'), {
        user: req.session?.user,
        req,
        userCount,
        serverCount,
        settings,
        components: {
          header: api.getComponentPath('views/components/header'),
          template: api.getComponentPath('views/components/template'),
          footer: api.getComponentPath('views/components/footer')
        }
      });
    } catch (error) {
      logger.error('Error in test addon:', error);
      res.status(500).send('An error occurred');
    }
  });

  router.get('/api/stats', async (_req: any, res: any) => {
    try {
      const userCount = await prisma.users.count();
      const serverCount = await prisma.server.count();

      res.json({
        success: true,
        stats: {
          users: userCount,
          servers: serverCount
        }
      });
    } catch (error) {
      logger.error('Error in test addon API:', error);
      res.status(500).json({ success: false, error: 'An error occurred' });
    }
  });
}