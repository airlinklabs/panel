import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { getParamAsNumber } from '../../utils/typeHelpers';
import { invalidateLocationCache } from '../../handlers/nodesCache';

async function buildLocationsViewModel() {
  const locations = await prisma.location.findMany({
    include: { _count: { select: { nodes: true } } },
    orderBy: { id: 'asc' },
  });
  return { locations };
}

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
        res.redirect('/admin/nodes#locations');
      },
    );

    router.post(
      '/admin/locations',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
          if (!user) {
            if (req.get('HX-Request') === 'true') {
              return res.status(403).render('fragments/shared/error-banner', {
                targetId: 'admin-locations',
                message: 'Unauthorized access.',
                hint: null,
              });
            }
            res.status(403).json({ message: 'Unauthorized access.' });
            return;
          }

          const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
          const shortCode =
            typeof req.body.shortCode === 'string' ? req.body.shortCode.trim().toLowerCase() : '';

          if (name.length < 2 || name.length > 50) {
            if (req.get('HX-Request') === 'true') {
              return res.status(400).render('fragments/shared/error-banner', {
                targetId: 'admin-locations',
                message: 'Name must be between 2 and 50 characters.',
                hint: null,
              });
            }
            res.status(400).json({ message: 'Name must be between 2 and 50 characters.' });
            return;
          }
          if (!/^[a-z0-9-]{2,32}$/.test(shortCode)) {
            if (req.get('HX-Request') === 'true') {
              return res.status(400).render('fragments/shared/error-banner', {
                targetId: 'admin-locations',
                message: 'Short code must be 2-32 chars: lowercase letters, numbers, dashes.',
                hint: null,
              });
            }
            res.status(400).json({ message: 'Short code must be 2-32 chars: lowercase letters, numbers, dashes.' });
            return;
          }

          const existing = await prisma.location.findUnique({ where: { shortCode } });
          if (existing) {
            if (req.get('HX-Request') === 'true') {
              return res.status(400).render('fragments/shared/error-banner', {
                targetId: 'admin-locations',
                message: 'A location with this short code already exists.',
                hint: null,
              });
            }
            res.status(400).json({ message: 'A location with this short code already exists.' });
            return;
          }

          const location = await prisma.location.create({
            data: { name, shortCode },
            include: { _count: { select: { nodes: true } } },
          });
          await invalidateLocationCache();

          if (req.get('HX-Request') === 'true') {
            const vm = await buildLocationsViewModel();
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'success', message: 'Location created.' } } }));
            return res.render('fragments/admin/locations/location-list', vm);
          }
          res.status(200).json({ message: 'Location created successfully.', location });
        } catch (error: unknown) {
          logger.error('Error creating location:', error);
          if (req.get('HX-Request') === 'true') {
            return res.status(500).render('fragments/shared/error-banner', {
              targetId: 'admin-locations',
              message: 'Error creating location.',
              hint: null,
            });
          }
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
            if (req.get('HX-Request') === 'true') {
              return res.status(400).render('fragments/shared/error-banner', {
                targetId: 'admin-locations',
                message: 'Invalid location ID.',
                hint: null,
              });
            }
            res.status(400).json({ message: 'Invalid location ID.' });
            return;
          }

          const nodeCount = await prisma.node.count({ where: { locationId } });
          if (nodeCount > 0) {
            if (req.get('HX-Request') === 'true') {
              return res.status(400).render('fragments/shared/error-banner', {
                targetId: 'admin-locations',
                message: `Location has ${nodeCount} node(s) assigned. Remove them from the location first.`,
                hint: null,
              });
            }
            res.status(400).json({
              message: `Location has ${nodeCount} node(s) assigned. Remove them from the location first.`,
            });
            return;
          }

          await prisma.location.delete({ where: { id: locationId } });
          await invalidateLocationCache();

          if (req.get('HX-Request') === 'true') {
            const vm = await buildLocationsViewModel();
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'success', message: 'Location deleted.' } } }));
            return res.render('fragments/admin/locations/location-list', vm);
          }
          res.status(200).json({ message: 'Location deleted successfully.' });
        } catch (error: unknown) {
          logger.error('Error deleting location:', error);
          if (req.get('HX-Request') === 'true') {
            return res.status(500).render('fragments/shared/error-banner', {
              targetId: 'admin-locations',
              message: 'Error deleting location.',
              hint: null,
            });
          }
          res.status(500).json({ message: 'Error deleting location.' });
        }
      },
    );

    router.put(
      '/admin/location/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const locationId = getParamAsNumber(req.params.id);
          if (isNaN(locationId)) {
            return res.status(400).json({ message: 'Invalid location ID.' });
          }

          const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
          const shortCode =
            typeof req.body.shortCode === 'string' ? req.body.shortCode.trim().toLowerCase() : '';

          if (name.length < 2 || name.length > 50) {
            return res.status(400).json({ message: 'Name must be between 2 and 50 characters.' });
          }
          if (!/^[a-z0-9-]{2,32}$/.test(shortCode)) {
            return res.status(400).json({ message: 'Short code must be 2-32 chars: lowercase letters, numbers, dashes.' });
          }

          const existing = await prisma.location.findFirst({
            where: { shortCode, id: { not: locationId } },
          });
          if (existing) {
            return res.status(400).json({ message: 'A location with this short code already exists.' });
          }

          const location = await prisma.location.update({
            where: { id: locationId },
            data: { name, shortCode },
            include: { _count: { select: { nodes: true } } },
          });
          await invalidateLocationCache();

          if (req.get('HX-Request') === 'true') {
            const vm = await buildLocationsViewModel();
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'success', message: 'Location updated.' } } }));
            return res.render('fragments/admin/locations/location-list', vm);
          }
          res.status(200).json({ message: 'Location updated.', location });
        } catch (error: unknown) {
          logger.error('Error updating location:', error);
          res.status(500).json({ message: 'Error updating location.' });
        }
      },
    );

    router.get(
      '/admin/location/:id/nodes',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const locationId = getParamAsNumber(req.params.id);
          if (isNaN(locationId)) {
            return res.status(400).render('fragments/shared/error-banner', {
              targetId: 'admin-locations',
              message: 'Invalid location ID.',
              hint: null,
            });
          }

          const location = await prisma.location.findUnique({ where: { id: locationId } });
          if (!location) {
            return res.status(404).render('fragments/shared/error-banner', {
              targetId: 'admin-locations',
              message: 'Location not found.',
              hint: null,
            });
          }

          const locationNodes = await prisma.node.findMany({
            where: { locationId },
            include: { servers: { select: { id: true } } },
            orderBy: { name: 'asc' },
          });

          res.render('fragments/admin/locations/location-nodes', { location, nodes: locationNodes });
        } catch (error: unknown) {
          logger.error('Error fetching location nodes:', error);
          res.status(500).render('fragments/shared/error-banner', {
            targetId: 'admin-locations',
            message: 'Error fetching nodes.',
            hint: null,
          });
        }
      },
    );

    return router;
  },
};

export default locationsModule;
