import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { getAllAddons, toggleAddonStatus, reloadAddons, loadAddons, uninstallAddon } from '../../handlers/addonHandler';
import { commandRegistry } from '../../handlers/addonCommands';
import { registerPermission, Permission } from '../../handlers/permissions';
import { parseAddonManifest } from '../../handlers/addonManifest';
import { getParamAsString } from '../../utils/typeHelpers';

const execFileAsync = promisify(execFile);

registerPermission('airlink.admin.addons.view');
registerPermission('airlink.admin.addons.toggle');
registerPermission('airlink.admin.addons.reload');
registerPermission('airlink.admin.addons.store');
registerPermission('airlink.admin.addons.install');
registerPermission('airlink.admin.addons.settings' as Permission);
registerPermission('airlink.admin.addons.commands' as Permission);

const ADDONS_REPO_OWNER = 'airlinklabs';
const ADDONS_REPO_NAME  = 'addons';
const ADDONS_RAW_BASE   = `https://raw.githubusercontent.com/${ADDONS_REPO_OWNER}/${ADDONS_REPO_NAME}/main`;
const GITHUB_API_BASE   = `https://api.github.com/repos/${ADDONS_REPO_OWNER}/${ADDONS_REPO_NAME}`;

const ALLOWED_CMD_PREFIXES = [
  'npm install', 'npm ci', 'npm run ', 'npx ',
  'yarn', 'yarn install', 'yarn run ',
  'npx prisma ', 'prisma ',
  'mv ', 'cp ', 'mkdir ',
];

const PATH_LIKE_BINS = new Set(['cp', 'mv', 'mkdir']);

function isSafeCommand(cmd: string): boolean {
  const c = cmd.trim();
  return ALLOWED_CMD_PREFIXES.some(p => c === p.trimEnd() || c.startsWith(p));
}

function parseCommand(cmd: string): { bin: string; args: string[] } {
  const parts = cmd.trim().split(/\s+/);
  return { bin: parts[0], args: parts.slice(1) };
}

function validateCommandArgs(bin: string, args: string[], workDir: string): { safe: boolean; error?: string } {
  if (!PATH_LIKE_BINS.has(bin)) return { safe: true };

  for (const arg of args) {
    if (arg.startsWith('-')) continue;
    const resolved = path.resolve(workDir, arg);
    if (!resolved.startsWith(workDir + path.sep) && resolved !== workDir) {
      return {
        safe: false,
        error: `Path traversal detected in argument "${arg}" resolves outside work directory`,
      };
    }
  }
  return { safe: true };
}

interface InstallManifest {
  name?: string;
  author?: string;
  repo?: string;
  branch?: string;
  note?: string;
  commands?: Record<string, string>;
}

async function* runInstall(
  manifest: InstallManifest,
  workDir: string
): AsyncGenerator<{ type: string; step?: string; cmd?: string; output?: string; message?: string }> {
  const commands = manifest.commands || {};
  const keys = Object.keys(commands).sort((a, b) => Number(a) - Number(b));

  if (keys.length === 0) {
    yield { type: 'done', message: 'No commands to run' };
    return;
  }

  for (const key of keys) {
    const cmd = commands[key].trim();

    if (!isSafeCommand(cmd)) {
      yield { type: 'error', message: `Command not permitted: "${cmd}"` };
      return;
    }

    const { bin, args } = parseCommand(cmd);
    const argCheck = validateCommandArgs(bin, args, workDir);
    if (!argCheck.safe) {
      yield { type: 'error', message: argCheck.error! };
      return;
    }

    yield { type: 'cmd', step: `Step ${key}`, cmd };

    try {
      const { stdout, stderr } = await execFileAsync(bin, args, { cwd: workDir });
      const output = (stdout + stderr).trim();
      if (output) yield { type: 'output', step: `Step ${key}`, cmd, output };
    } catch (err: any) {
      const output = ((err.stdout || '') + (err.stderr || '')).trim() || err.message;
      yield { type: 'error', message: `"${cmd}" failed: ${output}` };
      return;
    }
  }

  yield { type: 'done', message: 'Installation complete' };
}

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
          res.status(500).json({ success: false, message: error.message });
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

          const contents = await contentsRes.json() as any[];
          const folders = contents.filter((i: any) => i.type === 'dir' && !i.name.startsWith('.'));

          const addonData = await Promise.all(
            folders.map(async (folder: any) => {
              try {
                const infoRes = await fetch(`${ADDONS_RAW_BASE}/${folder.name}/info.json`, {
                  headers: { 'User-Agent': 'airlink-panel' },
                });
                if (!infoRes.ok) return null;
                const info = await infoRes.json() as any;

                let installManifest: InstallManifest = {};
                try {
                  const instRes = await fetch(`${ADDONS_RAW_BASE}/${folder.name}/install.json`, {
                    headers: { 'User-Agent': 'airlink-panel' },
                  });
                  if (instRes.ok) installManifest = await instRes.json() as InstallManifest;
                } catch { /* best-effort */ }

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
                  features: info.features || [],
                  github: info.github || `https://github.com/${ADDONS_REPO_OWNER}/${ADDONS_REPO_NAME}/tree/main/${folder.name}`,
                  screenshots: info.screenshots || [],
                  installRepo: installManifest.repo || '',
                  installBranch: installManifest.branch || 'main',
                  installNote: installManifest.note || '',
                  installCommands: installManifest.commands || {},
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

    router.get(
      '/admin/addons/store/discussions',
      isAuthenticated(true, 'airlink.admin.addons.store'),
      async (_req: Request, res: Response) => {
        try {
          const token = process.env.GITHUB_TOKEN;
          if (!token) return res.json({ success: true, counts: {} });

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

    router.post(
      '/admin/addons/store/install',
      isAuthenticated(true, 'airlink.admin.addons.install'),
      async (req: Request, res: Response) => {
        const { slug } = req.body;

        if (!slug || !/^[a-z0-9][a-z0-9-_]*$/i.test(slug)) {
          return res.status(400).json({ success: false, message: 'Invalid addon slug' });
        }

        const addonsDir = path.join(__dirname, '../../../storage/addons');
        const finalDir  = path.join(addonsDir, slug);

        if (!finalDir.startsWith(addonsDir + path.sep)) {
          return res.status(400).json({ success: false, message: 'Invalid slug' });
        }

        if (fs.existsSync(finalDir)) {
          return res.status(409).json({ success: false, message: 'Addon already installed' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

        const tempId  = crypto.randomBytes(4).toString('hex');
        const tempDir = path.join(addonsDir, `${slug}-${tempId}`);

        try {
          fs.mkdirSync(addonsDir, { recursive: true });

          const instRes = await fetch(`${ADDONS_RAW_BASE}/${slug}/install.json`, {
            headers: { 'User-Agent': 'airlink-panel' },
          });

          if (!instRes.ok) {
            send({ type: 'error', message: 'Could not fetch install.json for this addon' });
            res.end();
            return;
          }

          const manifest: InstallManifest = await instRes.json() as InstallManifest;
          const repoUrl = manifest.repo;
          const branch  = manifest.branch || 'main';

          if (!repoUrl || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(repoUrl)) {
            send({ type: 'error', message: 'install.json is missing a valid "repo" URL' });
            res.end();
            return;
          }

          send({ type: 'step', step: 'Clone', cmd: `git clone -b ${branch} ${repoUrl} ${slug}-${tempId}` });

          try {
            await execFileAsync(
              'git',
              ['clone', '--depth=1', '-b', branch, repoUrl, tempDir],
              {
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
              }
            );
          } catch (cloneErr: any) {
            const msg: string = ((cloneErr.stdout || '') + (cloneErr.stderr || '')).trim() || cloneErr.message;
            if (msg.toLowerCase().includes('username') || msg.toLowerCase().includes('authentication')) {
              send({ type: 'error', message: 'Clone failed: repository requires authentication' });
            } else {
              send({ type: 'error', message: `Clone failed: ${msg}` });
            }
            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
            res.end();
            return;
          }

          const gitDir = path.join(tempDir, '.git');
          if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true, force: true });

          send({ type: 'step', step: 'Setup', cmd: `cd ${slug}-${tempId}` });

          for await (const event of runInstall(manifest, tempDir)) {
            send(event);
            if (event.type === 'error') {
              fs.rmSync(tempDir, { recursive: true, force: true });
              res.end();
              return;
            }
            if (event.type === 'done') break;
          }

          fs.renameSync(tempDir, finalDir);

          send({ type: 'step', step: 'Register', cmd: 'loadAddons()' });
          await loadAddons(req.app);

          send({ type: 'done', message: `"${manifest.name || slug}" installed successfully` });
        } catch (error: any) {
          logger.error('Error installing addon:', error);
          if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
          send({ type: 'error', message: error.message });
        }

        res.end();
      }
    );

    router.get(
      '/admin/addons/:slug',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req: Request, res: Response) => {
        try {
          const slug = getParamAsString(req.params.slug);
          const addon = await prisma.addon.findUnique({ where: { slug } });
          if (!addon) return res.status(404).json({ success: false, message: 'Addon not found' });

          const addonsDir = path.join(__dirname, '../../../storage/addons');
          const packageJsonPath = path.join(addonsDir, slug, 'package.json');
          const result = parseAddonManifest(packageJsonPath, slug);

          const commands = commandRegistry.getAddonCommands(slug).map(c => ({ name: c.name, description: c.description }));

          const allSettings = await prisma.addonSetting.findMany({ where: { addonSlug: slug } });
          const settingsMap: Record<string, string> = {};
          for (const s of allSettings) settingsMap[s.key] = s.value;

          res.json({
            success: true,
            addon,
            manifest: result.success ? result.manifest : null,
            commands,
            settings: settingsMap,
          });
        } catch (error: any) {
          res.status(500).json({ success: false, message: error.message });
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
          res.json({ success: result.success, message: result.message });
        } catch (error: any) {
          logger.error('Error reloading addons:', error);
          res.status(500).json({ success: false, message: error.message });
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
          const packageJsonPath = path.join(addonsDir, slug, 'package.json');
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

          res.json({ success: true, message: 'Settings saved' });
        } catch (error: any) {
          res.status(500).json({ success: false, message: error.message });
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
          res.status(500).json({ success: false, message: error.message });
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

          res.json({ success: true, message: `Capability "${capability}" ${enabled ? 'enabled' : 'disabled'}` });
        } catch (error: any) {
          res.status(500).json({ success: false, message: error.message });
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

          if (!fs.existsSync(targetDir)) {
            return res.status(404).json({ success: false, message: 'Addon not found' });
          }

          await uninstallAddon(slug, req.app);
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

export default addonsModule;
