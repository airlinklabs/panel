import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { getParamAsNumber } from '../../utils/typeHelpers';

const locationsModule: Module = {
  info: {
    name: 'Admin Locations Module',
    description: 'Location (region) management for grouping nodes.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/locations',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
          if (!user) return res.redirect('/login');

          const locations = await prisma.location.findMany({
            include: { _count: { select: { nodes: true } } },
            orderBy: { name: 'asc' },
          });

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('admin/locations/locations', { user, req, settings, locations });
        } catch (error) {
          logger.error('Error fetching locations:', error);
          res.status(500).json({ message: 'Error fetching locations.' });
        }
      },
    );

    router.post(
      '/admin/locations',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
          if (!user) {
            res.status(403).json({ message: 'Unauthorized access.' });
            return;
          }

          const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
          const shortCode =
            typeof req.body.shortCode === 'string' ? req.body.shortCode.trim().toLowerCase() : '';

          if (name.length < 2 || name.length > 50) {
            res.status(400).json({ message: 'Name must be between 2 and 50 characters.' });
            return;
          }
          if (!/^[a-z0-9-]{2,32}$/.test(shortCode)) {
            res.status(400).json({ message: 'Short code must be 2-32 chars: lowercase letters, numbers, dashes.' });
            return;
          }

          const existing = await prisma.location.findUnique({ where: { shortCode } });
          if (existing) {
            res.status(400).json({ message: 'A location with this short code already exists.' });
            return;
          }

          const location = await prisma.location.create({
            data: { name, shortCode },
          });

          res.status(200).json({ message: 'Location created successfully.', location });
        } catch (error) {
          logger.error('Error creating location:', error);
          res.status(500).json({ message: 'Error creating location.' });
        }
      },
    );

    router.delete(
      '/admin/location/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const locationId = getParamAsNumber(req.params.id);
          if (isNaN(locationId)) {
            res.status(400).json({ message: 'Invalid location ID.' });
            return;
          }

          const nodeCount = await prisma.node.count({ where: { locationId } });
          if (nodeCount > 0) {
            res.status(400).json({
              message: `Location has ${nodeCount} node(s) assigned. Remove them from the location first.`,
            });
            return;
          }

          await prisma.location.delete({ where: { id: locationId } });
          res.status(200).json({ message: 'Location deleted successfully.' });
        } catch (error) {
          logger.error('Error deleting location:', error);
          res.status(500).json({ message: 'Error deleting location.' });
        }
      },
    );

    return router;
  },
};

export default locationsModule;
