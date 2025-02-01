import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

const adminModule: Module = {
  info: {
    name: 'Admin Module for Images',
    description: 'This file is for admin functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/images',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const images = await prisma.images.findMany();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          res.render('admin/images/images', { user, req, settings, images });
        } catch (error) {
          logger.error('Error fetching images:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post('/admin/images/upload', async (req, res) => {
      try {
        res.redirect('/admin/images?success=true');
      } catch (error) {
        logger.error('Error processing image upload:', error);
        res.status(500).send('Failed to process the uploaded file.');
      }
    });

    router.post(
      '/admin/images/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { name, scripts, variables, image } = req.body;

        try {
          res.redirect('/admin/images?err=none');
        } catch (error) {
          logger.error('Error creating image:', error);
          res.status(500).send('Failed to create image.');
        }
      },
    );

    router.delete(
      '/admin/images/delete/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { id } = req.params;

        try {
          const serverImage = await prisma.images.findUnique({
            where: { id: Number(id) },
          });
          if (serverImage) {
            res
              .status(400)
              .send(
                'This image is being used by a server. Please delete it from the server first.',
              );
            return;
          }

          await prisma.images.delete({ where: { id: Number(id) } });
          res.status(200).send('Image deleted successfully.');
        } catch (error) {
          logger.error('Error deleting image:', error);
          res.status(500).send('Failed to delete image.');
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
