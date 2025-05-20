import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

const adminModule: Module = {
  info: {
    name: 'Admin Locations Module',
    description: 'This file is for admin functionality of the Locations.',
    version: '1.0.0',
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
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const locations = await prisma.location.findMany({
            include: {
              _count: {
                select: { nodes: true }
              }
            }
          });

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/locations/locations', {
            user,
            req,
            settings,
            locations,
          });
        } catch (error) {
          logger.error('Error fetching locations:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/locations/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/locations/create', { 
            user, 
            req, 
            settings 
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/locations/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { name, shortCode, description } = req.body;

        if (!name || typeof name !== 'string') {
          res.status(400).json({ message: 'Name must be a string.' });
          return;
        } else if (name.length < 1 || name.length > 50) {
          res.status(400).json({
            message: 'Name must be between 1 and 50 characters long.',
          });
          return;
        }

        try {
          const location = await prisma.location.create({
            data: {
              name,
              shortCode: shortCode || null,
              description: description || null,
            },
          });

          res.status(201).json({ 
            success: true, 
            message: 'Location created successfully', 
            location 
          });
        } catch (error) {
          logger.error('Error creating location:', error);
          res.status(500).json({ 
            success: false, 
            message: 'Failed to create location' 
          });
        }
      },
    );

    router.get(
      '/admin/location/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const locationId = parseInt(req.params.id);
          if (isNaN(locationId)) {
            return res.status(400).json({ message: 'Invalid location ID' });
          }

          const location = await prisma.location.findUnique({
            where: { id: locationId },
            include: {
              nodes: true
            }
          });

          if (!location) {
            return res.status(404).json({ message: 'Location not found' });
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/locations/edit', {
            user,
            req,
            settings,
            location,
          });
        } catch (error) {
          logger.error('Error fetching location:', error);
          return res.redirect('/admin/locations');
        }
      },
    );

    router.put(
      '/admin/location/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const locationId = parseInt(req.params.id);
          if (isNaN(locationId)) {
            return res.status(400).json({ message: 'Invalid location ID' });
          }

          const { name, shortCode, description } = req.body;

          if (!name || typeof name !== 'string') {
            return res.status(400).json({ message: 'Name must be a string.' });
          } else if (name.length < 1 || name.length > 50) {
            return res.status(400).json({
              message: 'Name must be between 1 and 50 characters long.',
            });
          }

          const location = await prisma.location.update({
            where: { id: locationId },
            data: {
              name,
              shortCode: shortCode || null,
              description: description || null,
            },
          });

          res.status(200).json({ 
            success: true, 
            message: 'Location updated successfully', 
            location 
          });
        } catch (error) {
          logger.error('Error updating location:', error);
          res.status(500).json({ 
            success: false, 
            message: 'Failed to update location' 
          });
        }
      },
    );

    router.delete(
      '/admin/location/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const locationId = parseInt(req.params.id);
          if (isNaN(locationId)) {
            return res.status(400).json({ message: 'Invalid location ID' });
          }

          // Check if there are nodes associated with this location
          const nodeCount = await prisma.node.count({
            where: { locationId },
          });

          if (nodeCount > 0) {
            return res.status(400).json({ 
              success: false, 
              message: 'Cannot delete location with associated nodes. Please reassign or delete the nodes first.' 
            });
          }

          await prisma.location.delete({
            where: { id: locationId },
          });

          res.status(200).json({ 
            success: true, 
            message: 'Location deleted successfully' 
          });
        } catch (error) {
          logger.error('Error deleting location:', error);
          res.status(500).json({ 
            success: false, 
            message: 'Failed to delete location' 
          });
        }
      },
    );

    return router;
  },
};

export default adminModule;
