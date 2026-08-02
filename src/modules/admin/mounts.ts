import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const adminModule: Module = {
  info: {
    name: 'Admin Mounts Module',
    description: 'Manage host bind-mounts that can be attached to servers.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/mounts',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) return res.redirect('/login');
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const mounts = await prisma.mount.findMany({ include: { _count: { select: { servers: true } } } });
        res.render('admin/mounts/index', { user, req, settings, mounts });
      },
    );

    router.post(
      '/admin/mounts',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { name, source, target, readOnly } = req.body as Record<string, unknown>;
        if (!name || typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ success: false, error: 'Mount name is required.' });
        }
        if (!source || typeof source !== 'string' || !source.trim()) {
          return res.status(400).json({ success: false, error: 'Host source path is required.' });
        }
        if (!target || typeof target !== 'string' || !target.trim()) {
          return res.status(400).json({ success: false, error: 'Container target path is required.' });
        }

        try {
          await prisma.mount.create({
            data: {
              name: name.trim(),
              source: source.trim(),
              target: target.trim(),
              readOnly: readOnly === true || readOnly === 'true',
            },
          });
          return res.status(200).json({ success: true });
        } catch (error) {
          logger.error('Error creating mount:', error);
          return res.status(500).json({ success: false, error: 'Failed to create mount.' });
        }
      },
    );

    router.delete(
      '/admin/mounts/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
const id = parseInt(String(req.params?.id), 10);
        if (!id) return res.status(400).json({ success: false, error: 'Invalid mount id.' });
        try {
          await prisma.mount.delete({ where: { id } });
          return res.status(200).json({ success: true });
        } catch (error) {
          logger.error('Error deleting mount:', error);
          return res.status(500).json({ success: false, error: 'Failed to delete mount.' });
        }
      },
    );

    return router;
  },
};

export default adminModule;