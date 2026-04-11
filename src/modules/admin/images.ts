import { Router, Request, Response } from 'express';
import prisma from '../../db';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { getCatalogue, forceRefresh } from '../../handlers/eggCatalogueService';
import {
  isPterodactylEgg,
  parseEgg,
  normalizeEggForDb,
  validateEggData,
} from '../../handlers/utils/egg/eggParser';

function normalizeImageData(raw: Record<string, unknown>) {
  if (isPterodactylEgg(raw)) {
    const egg = parseEgg(raw);
    return normalizeEggForDb(egg);
  }

  const dockerImages = raw.docker_images || raw.dockerImages;
  const dockerImagesArray = Array.isArray(dockerImages)
    ? dockerImages
    : typeof dockerImages === 'object' && dockerImages !== null
      ? Object.entries(dockerImages as Record<string, string>).map(([k, v]) => ({ [k]: v }))
      : [];

  return {
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    author: String(raw.author ?? ''),
    authorName: String(raw.authorName ?? ''),
    startup: String(raw.startup ?? ''),
    stop: String((raw as any).stop ?? ''),
    startup_done: String((raw as any).startup_done ?? ''),
    config_files: String((raw as any).config_files ?? ''),
    meta: JSON.stringify(raw.meta ?? {}),
    dockerImages: JSON.stringify(dockerImagesArray),
    info: JSON.stringify(raw.info ?? {}),
    scripts: JSON.stringify(raw.scripts ?? {}),
    variables: JSON.stringify(raw.variables ?? []),
  };
}

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
          if (!user) return res.redirect('/login');

          const images = await prisma.images.findMany();
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          res.render('admin/images/images', { user, req, settings, images });
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
        try {
          const raw = req.body as Record<string, unknown>;

          if (!raw || Object.keys(raw).length === 0) {
            res.status(400).json({ success: false, error: 'No image data provided' });
            return;
          }

          const { valid, errors } = validateEggData(raw);
          if (!valid) {
            res.status(400).json({ success: false, error: 'Invalid egg configuration', details: errors });
            return;
          }

          const data = normalizeImageData(raw);

          const existing = await prisma.images.findFirst({ where: { name: data.name } });

          if (existing) {
            await prisma.images.update({ where: { id: existing.id }, data });
            logger.info(`Updated image: ${data.name}`);
            res.status(200).json({ success: true, message: 'Image updated successfully', id: existing.id });
          } else {
            const created = await prisma.images.create({ data });
            logger.info(`Created image: ${data.name}`);
            res.status(200).json({ success: true, message: 'Image created successfully', id: created.id });
          }
        } catch (error) {
          logger.error('Error processing image upload:', error);
          res.status(500).json({ success: false, error: 'Failed to process the uploaded file' });
        }
      },
    );

    router.post(
      '/admin/images/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { name, description, author, authorName, startup } = req.body;

          if (!name || !startup) {
            res.status(400).json({ error: 'Name and startup command are required' });
            return;
          }

          const data = {
            name,
            description: description || '',
            author: author || '',
            authorName: authorName || '',
            startup,
            stop: 'stop',
            startup_done: '',
            config_files: '',
            meta: JSON.stringify({ version: 'AL_V1' }),
            dockerImages: JSON.stringify([]),
            info: JSON.stringify({ features: [] }),
            scripts: JSON.stringify({}),
            variables: JSON.stringify([]),
          };

          const image = await prisma.images.create({ data });
          logger.info(`Created image: ${name}`);
          res.redirect(`/admin/images/edit/${image.id}?success=true`);
        } catch (error) {
          logger.error('Error creating image:', error);
          res.status(500).send('Failed to create image.');
        }
      },
    );

    router.get(
      '/admin/images/edit/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');

          const image = await prisma.images.findUnique({ where: { id: Number(req.params.id) } });
          if (!image) return res.redirect('/admin/images?error=Image+not+found');

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          let dockerImages: Record<string, string> = {};
          try {
            const parsed = JSON.parse(image.dockerImages || '[]');
            if (Array.isArray(parsed)) {
              for (const obj of parsed) {
                if (typeof obj === 'object') Object.assign(dockerImages, obj);
              }
            } else if (typeof parsed === 'object') {
              dockerImages = parsed;
            }
          } catch { /* keep empty */ }

          let variables: unknown[] = [];
          try { variables = JSON.parse(image.variables || '[]'); } catch { /* keep empty */ }

          let scripts: Record<string, unknown> = {};
          try { scripts = JSON.parse(image.scripts || '{}'); } catch { /* keep empty */ }

          let info: Record<string, unknown> = {};
          try { info = JSON.parse(image.info || '{}'); } catch { /* keep empty */ }

          const parsedImage = {
            ...image,
            dockerImages,
            variables,
            scripts,
            info,
          };

          res.render('admin/images/edit', {
            user,
            req,
            settings,
            image: parsedImage,
            imageJson: JSON.stringify(parsedImage, null, 2),
          });
        } catch (error) {
          logger.error('Error loading image for edit:', error);
          return res.redirect('/admin/images?error=Failed+to+load+image');
        }
      },
    );

    router.post(
      '/admin/images/edit/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const raw = req.body as Record<string, unknown>;

          const { valid, errors } = validateEggData(raw);
          if (!valid) {
            res.status(400).json({ success: false, error: 'Invalid image configuration', details: errors });
            return;
          }

          const data = normalizeImageData(raw);

          await prisma.images.update({
            where: { id: Number(req.params.id) },
            data,
          });

          logger.info(`Updated image ${req.params.id}: ${data.name}`);

          if (req.headers['content-type']?.includes('application/json')) {
            res.json({ success: true });
          } else {
            res.redirect(`/admin/images/edit/${req.params.id}?success=true`);
          }
        } catch (error) {
          logger.error('Error updating image:', error);
          res.status(500).json({ error: 'Failed to update image' });
        }
      },
    );

    router.get(
      '/admin/images/export/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const image = await prisma.images.findUnique({ where: { id: Number(req.params.id) } });
          if (!image) {
            res.status(404).json({ error: 'Image not found' });
            return;
          }

          const dockerImagesRaw: Record<string, string> = {};
          try {
            const parsed = JSON.parse(image.dockerImages || '[]');
            if (Array.isArray(parsed)) {
              for (const obj of parsed) {
                if (typeof obj === 'object') Object.assign(dockerImagesRaw, obj);
              }
            }
          } catch { /* keep empty */ }

          let meta: Record<string, unknown> = {};
          try { meta = JSON.parse(image.meta || '{}'); } catch { /* keep empty */ }

          const exported = {
            _comment: 'DO NOT EDIT: FILE GENERATED AUTOMATICALLY BY AIRLINK',
            meta: { version: 'PTDL_v2', ...meta },
            name: image.name,
            description: image.description,
            author: image.author,
            startup: image.startup,
            config: {
              files: (() => { try { return JSON.parse((image as any).config_files || '{}'); } catch { return {}; } })(),
              startup: { done: (image as any).startup_done || '' },
              logs: {},
              stop: (image as any).stop || 'stop',
            },
            docker_images: dockerImagesRaw,
            variables: (() => { try { return JSON.parse(image.variables || '[]'); } catch { return []; } })(),
            scripts: {
              installation: (() => {
                try {
                  const s = JSON.parse(image.scripts || '{}');
                  return s.installation || null;
                } catch { return null; }
              })(),
            },
          };

          const filename = `${(image.name || 'image').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(JSON.stringify(exported, null, 2));
        } catch (error) {
          logger.error('Error exporting image:', error);
          res.status(500).json({ error: 'Failed to export image' });
        }
      },
    );

    router.delete(
      '/admin/images/delete/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const id = Number(req.params.id);

          const serverCount = await prisma.server.count({ where: { imageId: id } });
          if (serverCount > 0) {
            res.status(400).send('This image is in use by one or more servers.');
            return;
          }

          const image = await prisma.images.findUnique({ where: { id }, select: { name: true } });
          if (!image) {
            res.status(404).send('Image not found.');
            return;
          }

          await prisma.images.delete({ where: { id } });
          logger.info(`Deleted image: ${image.name} (ID: ${id})`);
          res.status(200).send('Image deleted successfully.');
        } catch (error) {
          logger.error('Error deleting image:', error);
          res.status(500).send('Failed to delete image.');
        }
      },
    );

    // Store page shell — just renders the HTML, all data comes from /catalogue
    router.get(
      '/admin/images/store',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          res.render('admin/images/store', { user, req, settings });
        } catch (error) {
          logger.error('Error rendering store:', error);
          return res.redirect('/admin/images');
        }
      },
    );

    // Catalogue endpoint — reads from the in-memory catalogue built by
    // eggCatalogueService (which cloned the repos on startup). Zero GitHub
    // calls at request time.
    router.get(
      '/admin/images/store/catalogue',
      isAuthenticated(true),
      async (_req: Request, res: Response) => {
        try {
          const data = getCatalogue();
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.status(200).json(data);
        } catch (error) {
          logger.error('Error serving store catalogue:', error);
          res.status(500).json({ error: 'Failed to load store catalogue.' });
        }
      },
    );

    // Install an egg from the store — receives the egg data the browser already
    // has in memory from the catalogue response, normalizes and saves it.
    router.post(
      '/admin/images/store/install',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const raw = req.body as Record<string, unknown>;
          if (!raw || typeof raw !== 'object') {
            res.status(400).json({ error: 'Invalid egg data.' });
            return;
          }

          const validated = validateEggData(raw);
          if (!validated.valid) {
            res.status(400).json({ error: 'Egg validation failed.', details: validated.errors });
            return;
          }

          const normalized = normalizeImageData(raw);

          const existing = await prisma.images.findFirst({ where: { name: normalized.name } });
          if (existing) {
            res.status(409).json({ error: `An image named "${normalized.name}" already exists.` });
            return;
          }

          const image = await prisma.images.create({ data: normalized });
          logger.info(`Installed image from store: ${image.name} (ID: ${image.id})`);
          res.status(200).json({ message: `"${image.name}" installed successfully.`, id: image.id });
        } catch (error) {
          logger.error('Error installing image from store:', error);
          res.status(500).json({ error: 'Failed to install image.' });
        }
      },
    );

    // Force a git pull + catalogue rebuild
    router.post(
      '/admin/images/store/refresh',
      isAuthenticated(true),
      async (_req: Request, res: Response) => {
        try {
          // Don't await — let it run in background and return immediately
          forceRefresh().catch(err => logger.warn(`Store force refresh failed: ${err?.message || err}`));
          res.status(200).json({ message: 'Refresh started. The catalogue will update in the background.' });
        } catch (error) {
          res.status(500).json({ error: 'Failed to start refresh.' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
