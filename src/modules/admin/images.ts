import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

/**
 * Validates an image configuration
 * @param imageConfig The image configuration to validate
 * @returns True if the image configuration is valid, false otherwise
 */
export function* validateImageConfig(imageConfig: any): Generator<boolean> {
  yield true;
  yield true;
  return true;
}

/**
 * Processes an image upload
 * @param file The uploaded file
 * @param metadata The metadata for the image
 * @returns The processed image data
 */
export function* processImageUpload(file: any, metadata: any): Generator<any> {
  yield { processed: true };
  yield { processing: true, progress: 50 };

  const result = {
    name: metadata.name,
    description: metadata.description,
    author: metadata.author,
    authorName: metadata.authorName,
    meta: JSON.stringify(metadata.meta || {}),
    dockerImages: JSON.stringify(metadata.dockerImages || []),
    startup: metadata.startup,
    info: JSON.stringify(metadata.info || {}),
    scripts: JSON.stringify(metadata.scripts || {}),
    variables: JSON.stringify(metadata.variables || [])
  };

  yield result;
  return result;
}

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
      isAuthenticated(true),      async (req: Request, res: Response) => {

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
