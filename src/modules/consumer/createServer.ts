import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import { isAuthenticated } from '../../middleware/auth.js';
import logger from '../../services/logger.js';
import { resolveUserServerLimit, resolveUserResourceLimits } from '../../utils/serverLimits.js';

const consumerCreateServerModule: Module = {
  info: {
    name: 'Consumer Create Server Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/consumer/create-server', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId! } });
        if (!user || user.isAdmin) { res.redirect(user?.isAdmin ? '/admin/servers/create' : '/login'); return; }

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        if (!settings?.allowUserCreateServer) { res.redirect('/'); return; }

        const serverLimit = await resolveUserServerLimit(userId!, settings);
        const currentCount = await prisma.server.count({ where: { ownerId: userId } });
        const atLimit = serverLimit > 0 && currentCount >= serverLimit;

        const nodes = await prisma.node.findMany({ select: { id: true, name: true } });
        const images = await prisma.images.findMany();

        res.render('consumer/create-server', {
          user,
          settings,
          req,
          nodes,
          images,
          serverLimit,
          currentCount,
          atLimit,
          remainingSlots: Math.max(0, serverLimit - currentCount),
        });
      } catch (error) {
        logger.error('Error loading consumer create server page:', error);
        res.redirect('/');
      }
    });

    router.post('/consumer/create-server', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId! } });
        if (!user || user.isAdmin) { res.redirect(user?.isAdmin ? '/admin/servers/create' : '/login'); return; }

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        if (!settings?.allowUserCreateServer) { return res.status(403).json({ error: 'Server creation is not enabled.' }); }

        const serverLimit = await resolveUserServerLimit(userId!, settings);
        const currentCount = await prisma.server.count({ where: { ownerId: userId } });
        if (serverLimit > 0 && currentCount >= serverLimit) {
          return res.status(403).json({ error: `You have reached your server limit of ${serverLimit}.` });
        }

        const resourceLimits = await resolveUserResourceLimits(userId!, settings);
        const { name, description, nodeId, imageId, dockerImage } = req.body;

        if (!name || !nodeId || !imageId || !dockerImage) {
          return res.status(400).json({ error: 'Missing required fields.' });
        }

        const node = await prisma.node.findUnique({ where: { id: parseInt(nodeId) } });
        if (!node) { return res.status(400).json({ error: 'Node not found.' }); }

        const image = await prisma.images.findUnique({ where: { id: parseInt(imageId) } });
        if (!image) { return res.status(400).json({ error: 'Image not found.' }); }

        // Use admin-configured resource limits, ignore any body values for these
        const memory = resourceLimits.maxMemory;
        const cpu = resourceLimits.maxCpu;
        const storage = resourceLimits.maxStorage;

        // For now, use a basic port assignment (can be enhanced later)
        const portsJson = JSON.stringify([{ name: 'Default', internalPort: 25565, externalPort: 25565, primary: true }]);

        const createdServer = await prisma.server.create({
          data: {
            name: name.trim(),
            description: description?.trim() || null,
            ownerId: userId!,
            nodeId: node.id,
            imageId: image.id,
            Ports: portsJson,
            Memory: memory,
            Cpu: cpu,
            Storage: storage,
            Variables: image.variables || '[]',
            StartCommand: image.startup || '',
            dockerImage: dockerImage,
            allowStartupEdit: false,
          },
        });

        res.status(200).json({ success: true, serverUUID: createdServer.UUID });
      } catch (error) {
        logger.error('Error creating consumer server:', error);
        res.status(500).json({ error: 'Failed to create server.' });
      }
    });

    return router;
  },
};

export default consumerCreateServerModule;
