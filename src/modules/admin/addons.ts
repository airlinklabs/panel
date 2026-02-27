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

const ADDONS_REPO_OWNER = 'airlinklabs';
const ADDONS_REPO_NAME  = 'addons';
const ADDONS_RAW_BASE   = `https://raw.githubusercontent.com/${ADDONS_REPO_OWNER}/${ADDONS_REPO_NAME}/main`;
const GITHUB_API_BASE   = `https://api.github.com/repos/${ADDONS_REPO_OWNER}/${ADDONS_REPO_NAME}`;

// Only these exact command strings are executable from install.json
const ALLOWED_EXEC_TOKENS: Record<string, { bin: string; args: string[] }> = {
  'npm install':   { bin: 'npm', args: ['install'] },
  'npm ci':        { bin: 'npm', args: ['ci'] },
  'npm run build': { bin: 'npm', args: ['run', 'build'] },
  'yarn':          { bin: 'yarn', args: [] },
  'yarn install':  { bin: 'yarn', args: ['install'] },
};

interface InstallStep {
  title: string;
  commands: string[];
}

interface InstallManifest {
  steps?: InstallStep[];
  note?: string;
}

async function* executeInstallManifest(
  addonDir: string
): AsyncGenerator<{ stepTitle: string; cmd: string; done?: boolean; error?: string }> {
  const manifestPath = path.join(addonDir, 'install.json');
  if (!fs.existsSync(manifestPath)) {
    yield { stepTitle: 'Setup', cmd: '', done: true };
    return;
  }

  const manifest: InstallManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!Array.isArray(manifest.steps) || manifest.steps.length === 0) {
    yield { stepTitle: 'Setup', cmd: '', done: true };
    return;
  }

  for (const step of manifest.steps) {
    for (const cmd of (step.commands || [])) {
      const normalized = cmd.trim();
      const allowed = ALLOWED_EXEC_TOKENS[normalized];
      if (!allowed) {
        yield {
          stepTitle: step.title,
          cmd: normalized,
          error: `Command not permitted: "${normalized}". Allowed: ${Object.keys(ALLOWED_EXEC_TOKENS).join(', ')}`,
        };
        return;
      }
      yield { stepTitle: step.title, cmd: normalized };
      await execFileAsync(allowed.bin, allowed.args, { cwd: addonDir });
    }
  }

  yield { stepTitle: 'Complete', cmd: '', done: true };
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
          } catch {
            addonTableExists = false;
          }

          res.render('admin/addons/addons', { user, req, settings, addons, addonTableExists, errorMessage: {} });
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
          const enabledBool = req.body.enabled === 'true' || req.body.enabled === true;
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
          const addons = await getAllAddons();

          res.render('admin/addons/store', { user, req, settings, addons, errorMessage: {} });
        } catch (error) {
          logger.error('Error rendering addon store:', error);
          return res.redirect('/admin/addons');
        }
      }
    );

    // Reads each addon folder's info.json from GitHub
    router.get(
      '/admin/addons/store/list',
      isAuthenticated(true, 'airlink.admin.addons.store'),
      async (_req: Request, res: Response) => {
        try {
          const contentsRes = await fetch(`${GITHUB_API_BASE}/contents`, {
            headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'airlink-panel' },
          });

          if (!contentsRes.ok) {
            return res.status(502).json({ success: false, message: 'Failed to fetch addon list from GitHub' });
          }

          const contents: any[] = await contentsRes.json();
          const folders = contents.filter((i: any) => i.type === 'dir' && !i.name.startsWith('.'));

          const addonData = await Promise.all(
            folders.map(async (folder: any) => {
              try {
                const infoRes = await fetch(`${ADDONS_RAW_BASE}/${folder.name}/info.json`, {
                  headers: { 'User-Agent': 'airlink-panel' },
                });
                if (!infoRes.ok) return null;
                const info = await infoRes.json();
                return {
                  id: folder.name,
                  name: info.name || folder.name,
                  version: info.version || '',
                  description: info.description || '',
                  longDescription: info.longDescription || info.description || '',
                  author: info.author || '',
                  status: info.status || 'working',
                  tags: info.tags || [],
                  icon: info.icon || '',
                  iconType: info.iconType || 'url',
                  features: info.features || [],
                  github: info.github || `https://github.com/${ADDONS_REPO_OWNER}/${ADDONS_REPO_NAME}/tree/main/${folder.name}`,
                  screenshots: info.screenshots || [],
                  installNote: info.installNote || '',
                };
              } catch {
                return null;
              }
            })
          );

          res.json({ success: true, addons: addonData.filter(Boolean) });
        } catch (error: any) {
          logger.error('Error fetching addon store list:', error);
          res.status(500).json({ success: false, message: error.message });
        }
      }
    );

    // Returns discussion comment counts keyed by discussion title (addon id)
    router.get(
      '/admin/addons/store/discussions',
      isAuthenticated(true, 'airlink.admin.addons.store'),
      async (_req: Request, res: Response) => {
        try {
          const token = process.env.GITHUB_TOKEN;
          if (!token) {
            return res.json({ success: true, counts: {} });
          }

          const query = `{
            repository(owner: "${ADDONS_REPO_OWNER}", name: "${ADDONS_REPO_NAME}") {
              discussions(first: 100) {
                nodes { title comments { totalCount } }
              }
            }
          }`;

          const ghRes = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'airlink-panel',
            },
            body: JSON.stringify({ query }),
          });

          if (!ghRes.ok) return res.json({ success: true, counts: {} });

          const data: any = await ghRes.json();
          const nodes = data?.data?.repository?.discussions?.nodes || [];
          const counts: Record<string, number> = {};
          for (const d of nodes) {
            if (d.title) counts[d.title.toLowerCase()] = d.comments.totalCount;
          }

          res.json({ success: true, counts });
        } catch {
          res.json({ success: true, counts: {} });
        }
      }
    );

    // SSE install endpoint — streams step-by-step progress
    router.post(
      '/admin/addons/store/install',
      isAuthenticated(true, 'airlink.admin.addons.install'),
      async (req: Request, res: Response) => {
        const { slug } = req.body;

        if (!slug || !/^[a-z0-9][a-z0-9-_]*$/i.test(slug)) {
          return res.status(400).json({ success: false, message: 'Invalid addon slug' });
        }

        const addonsDir = path.join(__dirname, '../../../storage/addons');
        const targetDir = path.join(addonsDir, slug);

        if (!targetDir.startsWith(addonsDir + path.sep)) {
          return res.status(400).json({ success: false, message: 'Invalid slug' });
        }

        if (fs.existsSync(targetDir)) {
          return res.status(409).json({ success: false, message: 'Addon already installed' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

        try {
          fs.mkdirSync(addonsDir, { recursive: true });

          send({ type: 'step', stepTitle: 'Cloning repository', cmd: 'git clone --sparse' });

          await execFileAsync('git', [
            'clone', '--depth=1', '--filter=blob:none', '--sparse',
            `https://github.com/${ADDONS_REPO_OWNER}/${ADDONS_REPO_NAME}`,
            targetDir,
          ]);

          send({ type: 'step', stepTitle: 'Extracting addon', cmd: `git sparse-checkout set ${slug}` });

          await execFileAsync('git', ['sparse-checkout', 'set', slug], { cwd: targetDir });

          const innerDir = path.join(targetDir, slug);
          if (fs.existsSync(innerDir)) {
            for (const item of fs.readdirSync(innerDir)) {
              fs.renameSync(path.join(innerDir, item), path.join(targetDir, item));
            }
            fs.rmdirSync(innerDir);
          }

          const gitDir = path.join(targetDir, '.git');
          if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true, force: true });

          for await (const event of executeInstallManifest(targetDir)) {
            if (event.error) {
              send({ type: 'error', message: event.error });
              res.end();
              return;
            }
            if (!event.done) {
              send({ type: 'step', stepTitle: event.stepTitle, cmd: event.cmd });
            }
          }

          send({ type: 'step', stepTitle: 'Registering addon', cmd: 'loadAddons' });
          await loadAddons(req.app);

          send({ type: 'done', message: `Addon "${slug}" installed successfully` });
        } catch (error: any) {
          logger.error('Error installing addon:', error);
          send({ type: 'error', message: error.message });
        }

        res.end();
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

          if (!targetDir.startsWith(addonsDir + path.sep)) {
            return res.status(400).json({ success: false, message: 'Invalid slug' });
          }

          if (!fs.existsSync(targetDir)) {
            return res.status(404).json({ success: false, message: 'Addon not found' });
          }

          try {
            await prisma.addon.delete({ where: { slug } });
          } catch {
            // fine if not in DB
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
