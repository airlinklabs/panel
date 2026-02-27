import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { getAllAddons, toggleAddonStatus, reloadAddons, loadAddons } from '../../handlers/addonHandler';
import { registerPermission } from '../../handlers/permisions';
import { getParamAsString } from '../../utils/typeHelpers';

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

registerPermission('airlink.admin.addons.view');
registerPermission('airlink.admin.addons.toggle');
registerPermission('airlink.admin.addons.reload');
registerPermission('airlink.admin.addons.store');
registerPermission('airlink.admin.addons.install');

const ADDONS_REPO = 'https://github.com/airlinklabs/addons';
const ADDONS_INDEX_URL = 'https://raw.githubusercontent.com/airlinklabs/addons/main/index.json';

const ALLOWED_COMMANDS: Record<string, { bin: string; args: string[] }> = {
  'npm install':   { bin: 'npm', args: ['install'] },
  'npm ci':        { bin: 'npm', args: ['ci'] },
  'npm run build': { bin: 'npm', args: ['run', 'build'] },
  'yarn':          { bin: 'yarn', args: [] },
  'yarn install':  { bin: 'yarn', args: ['install'] },
};

async function runInstallManifest(addonDir: string): Promise<void> {
  const manifestPath = path.join(addonDir, 'install.json');
  if (!fs.existsSync(manifestPath)) return;

  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw);

  if (!Array.isArray(manifest.commands)) {
    throw new Error('install.json "commands" must be an array');
  }

  for (const cmd of manifest.commands) {
    const allowed = ALLOWED_COMMANDS[cmd.trim()];
    if (!allowed) {
      throw new Error(
        `Command not permitted: "${cmd}". Allowed: ${Object.keys(ALLOWED_COMMANDS).join(', ')}`
      );
    }
    await execFileAsync(allowed.bin, allowed.args, { cwd: addonDir });
  }
}

const addonsModule: Module = {
  info: {
    name: 'Admin Addons Module',
    description: 'This file is for admin functionality of the Addons.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
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
          } catch (_error) {
            addonTableExists = false;
          }

          res.render('admin/addons/addons', {
            user,
            req,
            settings,
            addons,
            addonTableExists,
            errorMessage: {},
          });
        } catch (error) {
          logger.error('Error fetching addons:', error);
          return res.redirect('/admin/overview');
        }
      }
    );

    router.post(
      '/admin/addons/toggle/:slug',
      isAuthenticated(true, 'airlink.admin.addons.toggle'),
      async (req: Request, res: Response) => {
        try {
          const { slug } = req.params;
          const { enabled } = req.body;

          const enabledBool = enabled === 'true' || enabled === true;
          logger.info(`Toggling addon ${slug} to ${enabledBool ? 'enabled' : 'disabled'}`);
          const result = await toggleAddonStatus(getParamAsString(slug), enabledBool);

          if (result.success) {
            const reloadResult = await reloadAddons(req.app);
            res.json({
              success: true,
              message: result.message,
              migrationsApplied: (result.migrationsApplied || 0) + (reloadResult.migrationsApplied || 0),
            });
          } else {
            res.status(500).json({ success: false, message: result.message || 'Failed to update addon status' });
          }
        } catch (error: any) {
          logger.error('Error toggling addon status:', error);
          res.status(500).json({ success: false, message: error.message });
        }
      }
    );

    router.post(
      '/admin/addons/reload',
      isAuthenticated(true, 'airlink.admin.addons.reload'),
      async (req: Request, res: Response) => {
        try {
          const result = await reloadAddons(req.app);
          res.json({ success: result.success, message: result.message, migrationsApplied: result.migrationsApplied || 0 });
        } catch (error: any) {
          logger.error('Error reloading addons:', error);
          res.status(500).json({ success: false, message: error.message });
        }
      }
    );

    // ─── Store ────────────────────────────────────────────────────────────

    router.get(
      '/admin/addons/store',
      isAuthenticated(true, 'airlink.admin.addons.store'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('admin/addons/store', { user, req, settings, errorMessage: {} });
        } catch (error) {
          logger.error('Error rendering addon store:', error);
          return res.redirect('/admin/addons');
        }
      }
    );

    router.get(
      '/admin/addons/store/list',
      isAuthenticated(true, 'airlink.admin.addons.store'),
      async (_req: Request, res: Response) => {
        try {
          const response = await fetch(ADDONS_INDEX_URL);
          if (!response.ok) {
            return res.status(502).json({ success: false, message: 'Failed to fetch addon index from GitHub' });
          }
          const data = await response.json();
          res.json({ success: true, addons: data });
        } catch (error: any) {
          logger.error('Error fetching addon store list:', error);
          res.status(500).json({ success: false, message: error.message });
        }
      }
    );

    router.post(
      '/admin/addons/store/install',
      isAuthenticated(true, 'airlink.admin.addons.install'),
      async (req: Request, res: Response) => {
        try {
          const { slug } = req.body;

          if (!slug || !/^[a-z0-9][a-z0-9-_]*$/i.test(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid addon slug' });
          }

          const addonsDir = path.join(__dirname, '../../../storage/addons');
          const targetDir = path.join(addonsDir, slug);

          // Prevent path traversal
          if (!targetDir.startsWith(addonsDir)) {
            return res.status(400).json({ success: false, message: 'Invalid slug' });
          }

          if (fs.existsSync(targetDir)) {
            return res.status(409).json({ success: false, message: 'Addon already installed' });
          }

          fs.mkdirSync(addonsDir, { recursive: true });

          // Clone the addons repo with sparse checkout to get only this addon
          await execFileAsync('git', [
            'clone', '--depth=1', '--filter=blob:none', '--sparse', ADDONS_REPO, targetDir,
          ]);

          await execFileAsync('git', ['sparse-checkout', 'set', slug], { cwd: targetDir });

          // Flatten: sparse checkout leaves files under slug/slug/
          const innerDir = path.join(targetDir, slug);
          if (fs.existsSync(innerDir)) {
            for (const item of fs.readdirSync(innerDir)) {
              fs.renameSync(path.join(innerDir, item), path.join(targetDir, item));
            }
            fs.rmdirSync(innerDir);
          }

          // Strip .git
          const gitDir = path.join(targetDir, '.git');
          if (fs.existsSync(gitDir)) {
            fs.rmSync(gitDir, { recursive: true, force: true });
          }

          await runInstallManifest(targetDir);
          await loadAddons(req.app);

          res.json({ success: true, message: `Addon "${slug}" installed successfully` });
        } catch (error: any) {
          logger.error('Error installing addon:', error);
          res.status(500).json({ success: false, message: error.message });
        }
      }
    );

    router.post(
      '/admin/addons/store/uninstall',
      isAuthenticated(true, 'airlink.admin.addons.install'),
      async (req: Request, res: Response) => {
        try {
          const { slug } = req.body;

          if (!slug || !/^[a-z0-9][a-z0-9-_]*$/i.test(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid addon slug' });
          }

          const addonsDir = path.join(__dirname, '../../../storage/addons');
          const targetDir = path.join(addonsDir, slug);

          if (!targetDir.startsWith(addonsDir)) {
            return res.status(400).json({ success: false, message: 'Invalid slug' });
          }

          if (!fs.existsSync(targetDir)) {
            return res.status(404).json({ success: false, message: 'Addon not found' });
          }

          try {
            await prisma.addon.delete({ where: { slug } });
          } catch (_) {
            // Not in DB is fine
          }

          fs.rmSync(targetDir, { recursive: true, force: true });
          await reloadAddons(req.app);

          res.json({ success: true, message: `Addon "${slug}" uninstalled` });
        } catch (error: any) {
          logger.error('Error uninstalling addon:', error);
          res.status(500).json({ success: false, message: error.message });
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

export default addonsModule;
