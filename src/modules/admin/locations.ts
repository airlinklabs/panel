import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { LocationManager } from '../../handlers/utils/core/locationManager';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { PrismaClient } from '@prisma/client';

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

    router.get('/admin/locations', isAuthenticated(true), async (req: Request, res: Response): Promise<void> => {
      try {
        const locations = await LocationManager.getAllLocations();
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        res.render('admin/locations/locations', { 
          locations,
          user: req.session.user,
          settings
        });
      } catch (error) {
        res.status(500).send('Error fetching locations');
      }
    });

    router.get('/admin/locations/create', isAuthenticated(true), async (req: Request, res: Response): Promise<void> => {
      try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        res.render('admin/locations/create', { 
          user: req.session.user,
          settings 
        });
      } catch (error) {
        res.status(500).send('Error loading create page');
      }
    });

    router.post('/admin/locations/create', isAuthenticated(true), async (req: Request, res: Response): Promise<void> => {
      try {
        const { name, shortCode, description, latitude, longitude } = req.body;
        await LocationManager.createLocation({
          name,
          shortCode,
          description,
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined
        });
        res.redirect('/admin/locations');
      } catch (error) {
        res.status(500).send('Error creating location');
      }
    });

    router.get('/admin/locations/:id/edit', isAuthenticated(true), async (req: Request, res: Response): Promise<void> => {
      try {
        const location = await LocationManager.getLocation(parseInt(req.params.id));
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        if (!location) {
          res.status(404).send('Location not found');
          return;
        }
        res.render('admin/locations/edit', { 
          location, 
          user: req.session.user,
          settings 
        });
      } catch (error) {
        res.status(500).send('Error fetching location');
      }
    });

    router.post('/admin/locations/:id/edit', isAuthenticated(true), async (req: Request, res: Response): Promise<void> => {
      try {
        const { name, shortCode, description, latitude, longitude } = req.body;
        await LocationManager.updateLocation(parseInt(req.params.id), {
          name,
          shortCode,
          description,
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined
        });
        res.redirect('/admin/locations');
      } catch (error) {
        res.status(500).send('Error updating location');
      }
    });

    router.post('/admin/locations/:id/delete', isAuthenticated(true), async (req: Request, res: Response): Promise<void> => {
      try {
        await LocationManager.deleteLocation(parseInt(req.params.id));
        res.redirect('/admin/locations');
      } catch (error) {
        res.status(500).send('Error deleting location');
      }
    });

    router.get('/admin/locations/:id/stats', isAuthenticated(true), async (req: Request, res: Response): Promise<void> => {
      try {
        const stats = await LocationManager.getLocationStats(parseInt(req.params.id));
        if (!stats) {
          res.status(404).send('Location not found');
          return;
        }
        res.json(stats);
      } catch (error) {
        res.status(500).send('Error fetching location stats');
      }
    });

    return router;
  },
};

export default adminModule;