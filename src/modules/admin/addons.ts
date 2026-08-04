import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { getAllAddons, toggleAddonStatus, reloadAddons, loadAddons, uninstallAddon } from '../../handlers/addonHandler';
import { commandRegistry } from '../../handlers/addonCommands';
import { registerPermission, Permission } from '../../handlers/permissions';
import { parseAddonManifest } from '../../handlers/addonManifest';
import { getParamAsString } from '../../utils/typeHelpers';
import { containPath } from '../../utils/pathSecurity';

registerPermission('airlink.admin.addons.view');
registerPermission('airlink.admin.addons.toggle');
registerPermission('airlink.admin.addons.reload');
registerPermission('airlink.admin.addons.store');
registerPermission('airlink.admin.addons.install');
registerPermission('airlink.admin.addons.settings' as Permission);
registerPermission('airlink.admin.addons.commands' as Permission);

const addonsModule: Module = {
  info: {
    name: 'Admin Addons Module',
    description: 'This file is for admin functionality of the Addons.',
    version: '2.0.0',
    moduleVersion: '2.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/addons',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');

          const addons = await getAllAddons();
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          let addonTableExists = true;
          try {
            await prisma.$queryRaw`SELECT 1 FROM Addon LIMIT 1`;
          } catch {
            addonTableExists = false;
          }

          const addonsWithMeta = addons.map(addon => {
            const addonsDir = path.join(__dirname, '../../../storage/addons');
            const addonDir = path.join(addonsDir, addon.slug);
            const packageJsonPath = path.join(addonDir, 'package.json');
            const result = parseAddonManifest(packageJsonPath, addon.slug);
            const hasDisabledPh = fs.existsSync(path.join(addonDir, 'disabled.ph'));
            if (!result.success) return { ...addon, manifest: null, hasDisabledPh };
            return { ...addon, manifest: result.manifest, hasDisabledPh };
          });

          res.render('admin/addons/addons', { user, req, settings, addons: addonsWithMeta, addonTableExists, errorMessage: {} });
        } catch (error) {
          logger.error('Error fetching addons:', error);
          return res.redirect('/admin/overview');
        }
      }
    );

    router.get(
      '/admin/addons/list',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (_req: Request, res: Response) => {
        try {
          const addons = await getAllAddons();
          res.json({ success: true, addons });
        } catch (error: any) {
          logger.error('Error fetching addon list:', error);
          res.status(500).json({ success: false, message: 'Failed to fetch addons' });
        }
      }
    );

    router.get(
      '/admin/addons/store',
      isAuthenticated(true, 'airlink.admin.addons.store'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          const addons = await getAllAddons();

          res.render('admin/addons/store', { user, req, settings, addons, errorMessage: {} });
        } catch (error) {
          logger.error('Error rendering addon store:', error);
          return res.redirect('/admin/addons');
        }
      }
    );

    // All store API endpoints disabled — store is coming soon
    router.get('/admin/addons/store/list', (_req: Request, res: Response) => {
      res.status(410).json({ success: false, message: 'Addon store is not available yet.' });
    });

    router.get('/admin/addons/store/discussions', (_req: Request, res: Response) => {
      res.status(410).json({ success: false, message: 'Addon store is not available yet.' });
    });

    router.post('/admin/addons/store/install', (_req: Request, res: Response) => {
      res.status(410).json({ success: false, message: 'Addon store is not available yet.' });
    });

    router.post('/admin/addons/store/uninstall', (_req: Request, res: Response) => {
      res.status(410).json({ success: false, message: 'Addon store is not available yet.' });
    });

    router.get(
      '/admin/addons/:slug',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req: Request, res: Response) => {
        try {
          const slug = getParamAsString(req.params.slug);
          const addon = await prisma.addon.findUnique({ where: { slug } });
          if (!addon) return res.status(404).json({ success: false, message: 'Addon not found' });

          const addonsDir = path.join(__dirname, '../../../storage/addons');
          const addonDir = path.join(addonsDir, slug);
          if (!containPath(addonsDir, addonDir)) {
            return res.status(400).json({ success: false, message: 'Invalid addon slug' });
          }
          const packageJsonPath = path.join(addonDir, 'package.json');
          const result = parseAddonManifest(packageJsonPath, slug);

          const commands = commandRegistry.getAddonCommands(slug).map(c => ({ name: c.name, description: c.description }));

          const allSettings = await prisma.addonSetting.findMany({ where: { addonSlug: slug } });
          const settingsMap: Record<string, string> = {};
          for (const s of allSettings) settingsMap[s.key] = s.value;

          return res.json({
            success: true,
            addon,
            manifest: result.success ? result.manifest : null,
            commands,
            settings: settingsMap,
          });
        } catch (error: any) {
          logger.error('Error fetching addon:', error);
          return res.status(500).json({ success: false, message: 'Failed to fetch addon' });
        }
      }
    );

    router.post(
      '/admin/addons/toggle/:slug',
      isAuthenticated(true, 'airlink.admin.addons.toggle'),
      async (req: Request, res: Response) => {
        try {
          const slug = getParamAsString(req.params.slug);
          const enabledBool = req.body.enabled === 'true' || req.body.enabled === true;
          const result = await toggleAddonStatus(slug, enabledBool);

          if (result.success) {
            await reloadAddons(req.app);
            res.json({ success: true, message: result.message });
          } else {
            res.status(500).json({ success: false, message: result.message || 'Failed to update addon status' });
          }
        } catch (error: any) {
          logger.error('Error toggling addon status:', error);
          res.status(500).json({ success: false, message: 'Failed to update addon status' });
        }
      }
    );

    router.post(
      '/admin/addons/reload',
      isAuthenticated(true, 'airlink.admin.addons.reload'),
      async (req: Request, res: Response) => {
        try {
          const result = await reloadAddons(req.app);
          res.json({ success: result.success, message: result.message });
        } catch (error: any) {
          logger.error('Error reloading addons:', error);
          res.status(500).json({ success: false, message: 'Failed to reload addons' });
        }
      }
    );

    router.post(
      '/admin/addons/settings/:slug',
      isAuthenticated(true, 'airlink.admin.addons.settings'),
      async (req: Request, res: Response) => {
        try {
          const slug = getParamAsString(req.params.slug);
          const addon = await prisma.addon.findUnique({ where: { slug } });
          if (!addon) return res.status(404).json({ success: false, message: 'Addon not found' });

          const addonsDir = path.join(__dirname, '../../../storage/addons');
          const addonDir = path.join(addonsDir, slug);
          if (!containPath(addonsDir, addonDir)) {
            return res.status(400).json({ success: false, message: 'Invalid addon slug' });
          }
          const packageJsonPath = path.join(addonDir, 'package.json');
          const result = parseAddonManifest(packageJsonPath, slug);
          if (!result.success || !result.manifest.settingsSchema) {
            return res.status(400).json({ success: false, message: 'Addon has no settings schema' });
          }

          const schema = result.manifest.settingsSchema;
          const updates: Record<string, string> = {};

          for (const field of schema) {
            if (field.key in req.body) {
              let value = req.body[field.key];
              if (field.type === 'boolean') {
                value = value === 'true' || value === true ? 'true' : 'false';
              } else if (field.type === 'number') {
                const num = Number(value);
                if (isNaN(num)) continue;
                value = String(num);
              } else {
                value = String(value);
              }
              updates[field.key] = value;
            }
          }

          for (const [key, value] of Object.entries(updates)) {
            await prisma.addonSetting.upsert({
              where: { addonSlug_key: { addonSlug: slug, key } },
              create: { addonSlug: slug, key, value },
              update: { value },
            });
          }

          return res.json({ success: true, message: 'Settings saved' });
        } catch (error: any) {
          logger.error('Error saving addon settings:', error);
          return res.status(500).json({ success: false, message: 'Failed to save addon settings' });
        }
      }
    );

    router.post(
      '/admin/addons/command/:slug/:command',
      isAuthenticated(true, 'airlink.admin.addons.commands'),
      async (req: Request, res: Response) => {
        try {
          const slug = getParamAsString(req.params.slug);
          const command = getParamAsString(req.params.command);
          const args = req.body.args || [];
          const key = `${slug}:${command}`;
          const result = await commandRegistry.execute(key, args);
          res.json({ success: true, output: result });
        } catch (error: any) {
          logger.error('Error executing addon command:', error);
          res.status(500).json({ success: false, message: 'Failed to execute addon command' });
        }
      }
    );

    router.post(
      '/admin/addons/capability/:slug',
      isAuthenticated(true, 'airlink.admin.addons.settings'),
      async (req: Request, res: Response) => {
        try {
          const slug = getParamAsString(req.params.slug);
          const { capability, enabled } = req.body;

          const validCapabilities = ['wrapsDashboard', 'wrapsAdminLayout', 'runsRawSql', 'registersSchedules'];
          if (!validCapabilities.includes(capability)) {
            return res.status(400).json({ success: false, message: 'Invalid capability' });
          }

          await prisma.addonSetting.upsert({
            where: { addonSlug_key: { addonSlug: slug, key: `capability.${capability}` } },
            create: { addonSlug: slug, key: `capability.${capability}`, value: enabled ? 'true' : 'false' },
            update: { value: enabled ? 'true' : 'false' },
          });

          return res.json({ success: true, message: `Capability "${capability}" ${enabled ? 'enabled' : 'disabled'}` });
        } catch (error: any) {
          logger.error('Error updating addon capability:', error);
          return res.status(500).json({ success: false, message: 'Failed to update addon capability' });
        }
      }
    );

    router.post(
      '/admin/addons/uninstall/:slug',
      isAuthenticated(true, 'airlink.admin.addons.install'),
      async (req: Request, res: Response) => {
        try {
          const slug = getParamAsString(req.params.slug);
          const confirm = req.body.confirm;
          if (!confirm) {
            return res.status(400).json({ success: false, message: 'Confirmation required. Pass { "confirm": true } to proceed with uninstallation.' });
          }

          const addonsDir = path.join(__dirname, '../../../storage/addons');
          const targetDir = path.join(addonsDir, slug);

          if (!containPath(addonsDir, targetDir) || !fs.existsSync(targetDir)) {
            return res.status(404).json({ success: false, message: 'Addon not found' });
          }

          await uninstallAddon(slug, req.app);
          await reloadAddons(req.app);

          return res.json({ success: true, message: `Addon "${slug}" uninstalled` });
        } catch (error: any) {
          logger.error('Error uninstalling addon:', error);
          return res.status(500).json({ success: false, message: 'Failed to uninstall addon' });
        }
      }
    );

    return router;
  },
};

export default addonsModule;
