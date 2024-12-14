import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();
const upload = multer({ dest: 'uploads/' });

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
          res.render('admin/images/images', { user, req, logo: '', images });
        } catch (error) {
          logger.error('Error fetching images:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/images/upload',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const file = req.file;

        if (!file) {
          res.status(400).send('No file uploaded.');
          return;
        }

        try {
          // upload soon

          res.redirect('/admin/images?err=soon');
        } catch (error) {
          logger.error('Error uploading image:', error);
          res.status(500).send('Failed to upload image.');
        }
      },
    );

    router.post(
      '/admin/images/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { name, scripts, variables, image } = req.body;

        try {
          const newImage = await prisma.images.create({
            data: {
              name,
              image,
              scripts: scripts || null,
              variables: variables || null,
            },
          });

          res.redirect('/admin/images?err=none');
        } catch (error) {
          logger.error('Error creating image:', error);
          res.status(500).send('Failed to create image.');
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
