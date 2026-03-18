import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const adminModule: Module = {
  info: {
    name: 'Admin Security Module',
    description: 'Security settings for the panel.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/security',
      isAuthenticated(true),
      (_req: Request, res: Response) => {
        res.redirect('/admin/settings');
      },
    );

    router.post(
      '/admin/security/rate-limit',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const enabled = req.body.rateLimitEnabled === 'true' || req.body.rateLimitEnabled === true;
          const rpm = parseInt(req.body.rateLimitRpm, 10);

          if (isNaN(rpm) || rpm < 1 || rpm > 10000) {
            res.status(400).json({ success: false, error: 'RPM must be between 1 and 10000.' });
            return;
          }

          await prisma.settings.update({
            where: { id: 1 },
            data: { rateLimitEnabled: enabled, rateLimitRpm: rpm },
          });

          res.json({ success: true });
        } catch (error) {
          logger.error('Error updating rate limit settings:', error);
          res.status(500).json({ success: false, error: 'Failed to update settings.' });
        }
      },
    );

    router.post(
      '/admin/security/ban-ip',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { ip } = req.body;
          if (!ip || typeof ip !== 'string' || !/^[\d.:a-fA-F/]+$/.test(ip.trim())) {
            res.status(400).json({ success: false, error: 'Invalid IP address.' });
            return;
          }

          const cleanIp = ip.trim();
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          let banned: string[] = [];
          try { banned = JSON.parse(settings?.bannedIps || '[]'); } catch { /* keep empty */ }

          if (!banned.includes(cleanIp)) {
            banned.push(cleanIp);
            await prisma.settings.update({ where: { id: 1 }, data: { bannedIps: JSON.stringify(banned) } });
          }

          res.json({ success: true, banned });
        } catch (error) {
          logger.error('Error banning IP:', error);
          res.status(500).json({ success: false, error: 'Failed to ban IP.' });
        }
      },
    );

    router.post(
      '/admin/security/unban-ip',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { ip } = req.body;
          if (!ip || typeof ip !== 'string') {
            res.status(400).json({ success: false, error: 'IP is required.' });
            return;
          }

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          let banned: string[] = [];
          try { banned = JSON.parse(settings?.bannedIps || '[]'); } catch { /* keep empty */ }

          banned = banned.filter((b) => b !== ip);
          await prisma.settings.update({ where: { id: 1 }, data: { bannedIps: JSON.stringify(banned) } });

          res.json({ success: true, banned });
        } catch (error) {
          logger.error('Error unbanning IP:', error);
          res.status(500).json({ success: false, error: 'Failed to unban IP.' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
