import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const folderModule: Module = {
  info: {
    name: 'Folder System Module',
    description: 'DB-backed folders for organizing servers on the dashboard.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirlinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // List all folders with their member server UUIDs
    router.get('/api/folders', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const folders = await prisma.serverFolder.findMany({
          where: { ownerId: userId },
          include: { members: true },
          orderBy: { createdAt: 'asc' },
        });
        res.json({ success: true, folders });
      } catch (error) {
        logger.error('Error fetching folders:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch folders.' });
      }
    });

    // Create a new folder
    router.post('/api/folders', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id!;
        const { name } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return res.status(400).json({ success: false, error: 'Folder name is required.' });
        }
        if (name.trim().length > 64) {
          return res.status(400).json({ success: false, error: 'Folder name must be 64 characters or fewer.' });
        }

        const folder = await prisma.serverFolder.create({
          data: { name: name.trim(), ownerId: userId },
          include: { members: true },
        });

        res.json({ success: true, folder });
      } catch (error) {
        logger.error('Error creating folder:', error);
        res.status(500).json({ success: false, error: 'Failed to create folder.' });
      }
    });

    // Rename a folder
    router.patch('/api/folders/:id', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const folderId = parseInt(String(req.params.id), 10);
        const { name } = req.body;

        if (isNaN(folderId)) return res.status(400).json({ success: false, error: 'Invalid folder ID.' });
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return res.status(400).json({ success: false, error: 'Folder name is required.' });
        }

        const folder = await prisma.serverFolder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ success: false, error: 'Folder not found.' });
        if (folder.ownerId !== userId) return res.status(403).json({ success: false, error: 'Not your folder.' });

        const updated = await prisma.serverFolder.update({
          where: { id: folderId },
          data: { name: name.trim() },
          include: { members: true },
        });

        res.json({ success: true, folder: updated });
      } catch (error) {
        logger.error('Error renaming folder:', error);
        res.status(500).json({ success: false, error: 'Failed to rename folder.' });
      }
    });

    // Delete a folder (servers inside are unfoldered, not deleted)
    router.delete('/api/folders/:id', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const folderId = parseInt(String(req.params.id), 10);

        if (isNaN(folderId)) return res.status(400).json({ success: false, error: 'Invalid folder ID.' });

        const folder = await prisma.serverFolder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ success: false, error: 'Folder not found.' });
        if (folder.ownerId !== userId) return res.status(403).json({ success: false, error: 'Not your folder.' });

        await prisma.serverFolder.delete({ where: { id: folderId } });
        res.json({ success: true });
      } catch (error) {
        logger.error('Error deleting folder:', error);
        res.status(500).json({ success: false, error: 'Failed to delete folder.' });
      }
    });

    // Add a server to a folder (moves it if it's in another folder)
    router.post('/api/folders/:id/servers', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const folderId = parseInt(String(req.params.id), 10);
        const { serverUUID } = req.body;

        if (isNaN(folderId)) return res.status(400).json({ success: false, error: 'Invalid folder ID.' });
        if (!serverUUID) return res.status(400).json({ success: false, error: 'serverUUID is required.' });

        const folder = await prisma.serverFolder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ success: false, error: 'Folder not found.' });
        if (folder.ownerId !== userId) return res.status(403).json({ success: false, error: 'Not your folder.' });

        const server = await prisma.server.findUnique({ where: { UUID: serverUUID } });
        if (!server) return res.status(404).json({ success: false, error: 'Server not found.' });
        if (server.ownerId !== userId) return res.status(403).json({ success: false, error: 'Not your server.' });

        // Upsert: moves the server out of any previous folder into this one
        const member = await prisma.serverFolderMember.upsert({
          where: { serverUUID },
          create: { folderId, serverUUID },
          update: { folderId },
        });

        res.json({ success: true, member });
      } catch (error) {
        logger.error('Error adding server to folder:', error);
        res.status(500).json({ success: false, error: 'Failed to add server to folder.' });
      }
    });

    // Remove a server from its folder
    router.delete('/api/folders/servers/:serverUUID', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const serverUUID = String(req.params.serverUUID);

        const server = await prisma.server.findUnique({ where: { UUID: serverUUID } });
        if (!server) return res.status(404).json({ success: false, error: 'Server not found.' });
        if (server.ownerId !== userId) return res.status(403).json({ success: false, error: 'Not your server.' });

        await prisma.serverFolderMember.deleteMany({ where: { serverUUID } });
        res.json({ success: true });
      } catch (error) {
        logger.error('Error removing server from folder:', error);
        res.status(500).json({ success: false, error: 'Failed to remove server from folder.' });
      }
    });

    return router;
  },
};

export default folderModule;
