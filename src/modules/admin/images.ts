import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

/**
 * Validates an image configuration
 * @param imageConfig The image configuration to validate
 * @returns An object with validation result and any error messages
 */
export function validateImageConfig(imageConfig: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (!imageConfig.name) errors.push('Image name is required');
  if (!imageConfig.meta) errors.push('Meta information is required');
  if (!imageConfig.docker_images && !imageConfig.dockerImages) errors.push('Docker images are required');
  if (!imageConfig.startup) errors.push('Startup command is required');

  // Check if docker_images or dockerImages is an array
  const dockerImages = imageConfig.docker_images || imageConfig.dockerImages;
  if (dockerImages && !Array.isArray(dockerImages)) {
    errors.push('Docker images must be an array');
  }

  // Check if variables is an array if present
  if (imageConfig.variables && !Array.isArray(imageConfig.variables)) {
    errors.push('Variables must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Processes an image upload
 * @param imageData The image data to process
 * @returns The processed image data ready to be saved to the database
 */
export function processImageUpload(imageData: any): any {
  // Normalize field names (convert docker_images to dockerImages if needed)
  const normalizedData = {
    name: imageData.name,
    description: imageData.description || '',
    author: imageData.author || '',
    authorName: imageData.authorName || '',
    startup: imageData.startup || '',

    // Handle JSON fields, ensuring they're properly stringified
    meta: JSON.stringify(imageData.meta || {}),
    dockerImages: JSON.stringify(imageData.docker_images || imageData.dockerImages || []),
    info: JSON.stringify(imageData.info || {}),
    scripts: JSON.stringify(imageData.scripts || {}),
    variables: JSON.stringify(imageData.variables || [])
  };

  return normalizedData;
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

    router.post('/admin/images/upload', isAuthenticated(true), async (req: Request, res: Response) => {
      try {
        // Validate the uploaded JSON data
        const imageData = req.body;

        if (!imageData || Object.keys(imageData).length === 0) {
          res.status(400).json({ success: false, error: 'No image data provided' });
          return;
        }

        // Validate the image configuration
        const validation = validateImageConfig(imageData);
        if (!validation.isValid) {
          res.status(400).json({
            success: false,
            error: 'Invalid image configuration',
            details: validation.errors
          });
          return;
        }

        // Process the image data
        const processedData = processImageUpload(imageData);

        // Save to database
        const existingImage = await prisma.images.findFirst({
          where: { name: processedData.name }
        });

        if (existingImage) {
          // Update existing image
          await prisma.images.update({
            where: { id: existingImage.id },
            data: processedData
          });

          logger.info(`Updated existing image: ${processedData.name}`);
          res.status(200).json({
            success: true,
            message: 'Image updated successfully',
            id: existingImage.id
          });
          return;
        } else {
          // Create new image
          const newImage = await prisma.images.create({
            data: processedData
          });

          logger.info(`Created new image: ${processedData.name}`);
          res.status(200).json({
            success: true,
            message: 'Image created successfully',
            id: newImage.id
          });
          return;
        }
      } catch (error) {
        logger.error('Error processing image upload:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process the uploaded file'
        });
        return;
      }
    });

    router.post(
      '/admin/images/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { name, description, author, authorName, startup } = req.body;

          // Basic validation
          if (!name || !startup) {
            res.status(400).json({ error: 'Name and startup command are required' });
            return;
          }

          // Create a basic image structure
          const imageData = {
            name,
            description: description || '',
            author: author || '',
            authorName: authorName || '',
            startup,
            meta: JSON.stringify({ version: 'AL_V1' }),
            dockerImages: JSON.stringify([]),
            info: JSON.stringify({ features: [] }),
            scripts: JSON.stringify({ install: [] }),
            variables: JSON.stringify([])
          };

          // Save to database
          const newImage = await prisma.images.create({
            data: imageData
          });

          logger.info(`Created new basic image: ${name}`);
          res.redirect(`/admin/images/edit/${newImage.id}?success=true`);
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
          // Check if the image is being used by any servers
          const serversUsingImage = await prisma.server.count({
            where: { imageId: Number(id) },
          });

          if (serversUsingImage > 0) {
            res.status(400).send(
              'This image is being used by one or more servers. Please delete those servers first.',
            );
            return;
          }

          // Get image name for logging
          const image = await prisma.images.findUnique({
            where: { id: Number(id) },
            select: { name: true }
          });

          if (!image) {
            res.status(404).send('Image not found.');
            return;
          }

          // Delete the image
          await prisma.images.delete({ where: { id: Number(id) } });
          logger.info(`Deleted image: ${image.name} (ID: ${id})`);
          res.status(200).send('Image deleted successfully.');
        } catch (error) {
          logger.error('Error deleting image:', error);
          res.status(500).send('Failed to delete image.');
        }
      },
    );

    // Add route for editing images
    router.get(
      '/admin/images/edit/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { id } = req.params;
          const userId = req.session?.user?.id;

          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const image = await prisma.images.findUnique({
            where: { id: Number(id) },
          });

          if (!image) {
            return res.redirect('/admin/images?error=Image+not+found');
          }

          // Parse JSON fields for editing
          const parsedImage = {
            ...image,
            meta: JSON.parse(image.meta || '{}'),
            dockerImages: JSON.parse(image.dockerImages || '[]'),
            info: JSON.parse(image.info || '{}'),
            scripts: JSON.parse(image.scripts || '{}'),
            variables: JSON.parse(image.variables || '[]')
          };

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/images/edit', {
            user,
            req,
            settings,
            image: parsedImage,
            imageJson: JSON.stringify(parsedImage, null, 2)
          });
        } catch (error) {
          logger.error('Error fetching image for editing:', error);
          return res.redirect('/admin/images?error=Failed+to+load+image');
        }
      }
    );

    // Add route for updating images
    router.post(
      '/admin/images/edit/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { id } = req.params;
          const imageData = req.body;

          // Validate the image data
          const validation = validateImageConfig(imageData);
          if (!validation.isValid) {
            res.status(400).json({
              success: false,
              error: 'Invalid image configuration',
              details: validation.errors
            });
            return;
          }

          // Process the image data
          const processedData = processImageUpload(imageData);

          // Update the image
          await prisma.images.update({
            where: { id: Number(id) },
            data: processedData
          });

          logger.info(`Updated image: ${processedData.name} (ID: ${id})`);
          res.redirect(`/admin/images/edit/${id}?success=true`);
          return;
        } catch (error) {
          logger.error('Error updating image:', error);
          res.status(500).json({ error: 'Failed to update image' });
          return;
        }
      }
    );

    // Add route for exporting images as JSON
    router.get(
      '/admin/images/export/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { id } = req.params;

          const image = await prisma.images.findUnique({
            where: { id: Number(id) },
          });

          if (!image) {
            res.status(404).json({ error: 'Image not found' });
            return;
          }

          // Parse JSON fields
          const exportedImage = {
            meta: JSON.parse(image.meta || '{}'),
            name: image.name,
            description: image.description,
            author: image.author,
            authorName: image.authorName,
            docker_images: JSON.parse(image.dockerImages || '[]'),
            startup: image.startup,
            info: JSON.parse(image.info || '{}'),
            scripts: JSON.parse(image.scripts || '{}'),
            variables: JSON.parse(image.variables || '[]')
          };

          // Set headers for file download
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${image.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'image'}.json"`);

          // Send the JSON data
          res.send(JSON.stringify(exportedImage, null, 2));
        } catch (error) {
          logger.error('Error exporting image:', error);
          res.status(500).json({ error: 'Failed to export image' });
        }
      }
    );

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
