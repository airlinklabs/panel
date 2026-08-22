import { getSettings } from '../../handlers/settingsCache';
import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

async function buildMountsViewModel() {
  const mounts = await prisma.mount.findMany({ include: { _count: { select: { servers: true } } } });
  return { mounts };
}

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
        const settings = await await getSettings();
        const vm = await buildMountsViewModel();

        res.vary('HX-Request');
        if (req.get('HX-Request') === 'true') {
          return res.render('fragments/admin/mounts/mount-list', vm);
        }
        res.render('admin/mounts/index', { user, req, settings, ...vm });
      },
    );

    // HTMX fragment: render the create-mount modal
    router.get(
      '/admin/mounts/new',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        res.render('fragments/admin/mounts/mount-create-form');
      },
    );

    router.post(
      '/admin/mounts',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { name, source, target, readOnly } = req.body as Record<string, unknown>;
        if (!name || typeof name !== 'string' || !name.trim()) {
          if (req.get('HX-Request') === 'true') {
            return res.status(400).render('fragments/shared/error-banner', {
              targetId: 'admin-mounts',
              message: 'Mount name is required.',
              hint: null,
            });
          }
          return res.status(400).json({ success: false, error: 'Mount name is required.' });
        }
        if (!source || typeof source !== 'string' || !source.trim()) {
          if (req.get('HX-Request') === 'true') {
            return res.status(400).render('fragments/shared/error-banner', {
              targetId: 'admin-mounts',
              message: 'Host source path is required.',
              hint: null,
            });
          }
          return res.status(400).json({ success: false, error: 'Host source path is required.' });
        }
        if (!target || typeof target !== 'string' || !target.trim()) {
          if (req.get('HX-Request') === 'true') {
            return res.status(400).render('fragments/shared/error-banner', {
              targetId: 'admin-mounts',
              message: 'Container target path is required.',
              hint: null,
            });
          }
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

          if (req.get('HX-Request') === 'true') {
            const vm = await buildMountsViewModel();
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'success', message: 'Mount created.' }, 'close-mount-modal': true } }));
            return res.render('fragments/admin/mounts/mount-list', vm);
          }
          return res.status(200).json({ success: true });
        } catch (error: unknown) {
          logger.error('Error creating mount:', error);
          if (req.get('HX-Request') === 'true') {
            return res.status(500).render('fragments/shared/error-banner', {
              targetId: 'admin-mounts',
              message: 'Failed to create mount.',
              hint: null,
            });
          }
          return res.status(500).json({ success: false, error: 'Failed to create mount.' });
        }
      },
    );

    router.delete(
      '/admin/mounts/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const id = parseInt(String(req.params?.id), 10);
        if (!id) {
          if (req.get('HX-Request') === 'true') {
            return res.status(400).render('fragments/shared/error-banner', {
              targetId: 'admin-mounts',
              message: 'Invalid mount id.',
              hint: null,
            });
          }
          return res.status(400).json({ success: false, error: 'Invalid mount id.' });
        }
        try {
          await prisma.mount.delete({ where: { id } });

          if (req.get('HX-Request') === 'true') {
            const vm = await buildMountsViewModel();
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'success', message: 'Mount deleted.' } } }));
            return res.render('fragments/admin/mounts/mount-list', vm);
          }
          return res.status(200).json({ success: true });
        } catch (error: unknown) {
          logger.error('Error deleting mount:', error);
          if (req.get('HX-Request') === 'true') {
            return res.status(500).render('fragments/shared/error-banner', {
              targetId: 'admin-mounts',
              message: 'Failed to delete mount.',
              hint: null,
            });
          }
          return res.status(500).json({ success: false, error: 'Failed to delete mount.' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
