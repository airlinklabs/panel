import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

async function saveSettings(data: Record<string, any>) {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: data,
    create: {
      title: 'Airlink',
      ...data,
    },
  });
}

const airlinkCloudModule: Module = {
  info: {
    name: 'Airlink Cloud Module',
    description: 'Airlink Cloud integration settings.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirlinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/airlink-cloud',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('admin/airlink-cloud/settings', { user, req, settings });
        } catch (error) {
          logger.error('Error loading Airlink Cloud settings page:', error);
          res.redirect('/admin/overview');
        }
      },
    );

    router.post(
      '/admin/airlink-cloud',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { airlinkCloudApiKey, airlinkCloudBackupEnabled } = req.body;

          const data: Record<string, any> = {
            airlinkCloudApiKey: airlinkCloudApiKey || null,
            airlinkCloudBackupEnabled: airlinkCloudBackupEnabled === true || airlinkCloudBackupEnabled === 'true',
          };

          await saveSettings(data);
          res.json({ success: true });
        } catch (error) {
          logger.error('Error saving Airlink Cloud settings:', error);
          res.status(500).json({ success: false, error: 'Failed to save settings.' });
        }
      },
    );

    return router;
  },
};

export default airlinkCloudModule;
