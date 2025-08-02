import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { checkForUpdates, performUpdate } from '../../handlers/updater';
import { registerPermission } from '../../handlers/permisions';
import os from 'os';

const prisma = new PrismaClient();

registerPermission('airlink.admin.overview.main');
registerPermission('airlink.admin.overview.checkForUpdates');
registerPermission('airlink.admin.overview.performUpdate');
registerPermission('airlink.admin.overview.systemInfo');

interface ErrorMessage {
  message?: string;
}

const adminModule: Module = {
  info: {
    name: 'Admin Module',
    description: 'This file is for admin functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/overview',
      isAuthenticated(true, 'airlink.admin.overview.main'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const userCount = await prisma.users.count();
          const nodeCount = await prisma.node.count();
          const instanceCount = await prisma.server.count();
          const imageCount = await prisma.images.count();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/overview/overview', {
            errorMessage,
            user,
            userCount,
            instanceCount,
            nodeCount,
            imageCount,
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/check-update',
      isAuthenticated(true, 'airlink.admin.overview.checkForUpdates'),
      async (req: Request, res: Response) => {
        try {
          const updateInfo = await checkForUpdates();
          res.json(updateInfo);
        } catch (error) {
          logger.error('Error checking for updates:', error);
          res.status(500).json({ error: 'Error checking for updates' });
        }
      },
    );

    router.post(
      '/admin/perform-update',
      isAuthenticated(true, 'airlink.admin.overview.performUpdate'),
      async (req: Request, res: Response) => {
        try {
          const success = await performUpdate();
          if (success) {
            res.json({ message: 'Update completed successfully' });
          } else {
            res.status(500).json({ error: 'Error performing update' });
          }
        } catch (error) {
          logger.error('Error performing update:', error);
          res.status(500).json({ error: 'Error performing update' });
        }
      },
    );

    router.get(
      '/admin/system-info',
      isAuthenticated(true, 'airlink.admin.overview.systemInfo'),
      async (req: Request, res: Response) => {
        try {
          // Get system information
          const platform = os.platform();
          const arch = os.arch();
          const nodeVersion = process.version;
          const uptime = process.uptime();
          const cpuCores = os.cpus().length;
          
          // Get memory usage
          const memoryUsage = process.memoryUsage();
          const totalMemory = os.totalmem();
          const freeMemory = os.freemem();
          const usedMemory = totalMemory - freeMemory;
          
          // Format platform name for better display
          const formatPlatform = (platform: string): string => {
            switch (platform) {
            case 'win32': return 'Windows';
            case 'darwin': return 'macOS';
            case 'linux': return 'Linux';
            case 'freebsd': return 'FreeBSD';
            case 'openbsd': return 'OpenBSD';
            case 'sunos': return 'SunOS';
            default: return platform;
            }
          };

          // Format architecture for better display
          const formatArch = (arch: string): string => {
            switch (arch) {
            case 'x64': return 'x86_64';
            case 'arm64': return 'ARM64';
            case 'arm': return 'ARM';
            case 'ia32': return 'x86';
            default: return arch;
            }
          };

          const systemInfo = {
            platform: formatPlatform(platform),
            arch: formatArch(arch),
            nodeVersion: nodeVersion,
            uptime: Math.floor(uptime),
            cpuCores: cpuCores,
            memoryUsage: usedMemory, // System memory usage
            processMemory: memoryUsage.rss, // Process memory usage
            totalMemory: totalMemory,
            freeMemory: freeMemory,
            loadAverage: os.loadavg(),
            hostname: os.hostname(),
            osRelease: os.release(),
            osType: os.type(),
          };

          res.json(systemInfo);
        } catch (error) {
          logger.error('Error fetching system info:', error);
          res.status(500).json({ error: 'Error fetching system information' });
        }
      },
    );

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
