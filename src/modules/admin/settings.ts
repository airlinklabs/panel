import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dirs: Record<string, string> = {
      logo:                  'logos',
      favicon:               'favicons',
      themeFile:             'theme-zips',
      loginWallpaperFile:    'wallpapers',
      registerWallpaperFile: 'wallpapers',
    };
    const subdir = dirs[file.fieldname] || 'misc';
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', subdir);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    if (file.fieldname === 'favicon')  return cb(null, 'favicon' + ext);
    if (file.fieldname === 'themeFile') return cb(null, 'theme-' + Date.now() + '.zip');
    cb(null, file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.fieldname === 'themeFile') {
    const ext = path.extname(file.originalname).toLowerCase();
    return cb(null, ext === '.zip' || file.mimetype.includes('zip'));
  }
  const ok = ['image/jpeg','image/png','image/gif','image/svg+xml','image/x-icon','image/vnd.microsoft.icon'];
  cb(null, ok.includes(file.mimetype));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

function installThemeZip(zipPath: string): { success: boolean; error?: string } {
  const themesDir = path.join(process.cwd(), 'public', 'themes', 'user');
  const tempDir   = path.join(process.cwd(), 'public', 'uploads', 'theme-zips', 'tmp-' + Date.now());
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);
    const infoPath  = path.join(tempDir, 'info.json');
    const lightPath = path.join(tempDir, 'light.css');
    const darkPath  = path.join(tempDir, 'dark.css');
    if (!fs.existsSync(infoPath))  return { success: false, error: 'Theme zip must contain info.json.' };
    if (!fs.existsSync(lightPath)) return { success: false, error: 'Theme zip must contain light.css.' };
    if (!fs.existsSync(darkPath))  return { success: false, error: 'Theme zip must contain dark.css.' };
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
    const themeId  = randomUUID();
    const themeDir = path.join(themesDir, themeId);
    fs.mkdirSync(themeDir, { recursive: true });
    fs.copyFileSync(infoPath, path.join(themeDir, 'info.json'));
    fs.copyFileSync(lightPath, path.join(themeDir, 'light.css'));
    fs.copyFileSync(darkPath, path.join(themeDir, 'dark.css'));
    return { success: true };
  } catch (err: any) {
    if (err instanceof SyntaxError) return { success: false, error: 'info.json contains invalid JSON.' };
    if (err.message?.startsWith('Theme zip')) return { success: false, error: err.message };
    return { success: false, error: 'Failed to extract theme zip.' };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  }
}

function loadUserThemes() {
  const dir = path.join(process.cwd(), 'public', 'themes', 'user');
  if (!fs.existsSync(dir)) return [];
  const themes: any[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const infoPath  = path.join(dir, entry.name, 'info.json');
    const lightPath = path.join(dir, entry.name, 'light.css');
    const darkPath  = path.join(dir, entry.name, 'dark.css');
    if (!fs.existsSync(infoPath) || !fs.existsSync(lightPath) || !fs.existsSync(darkPath)) continue;
    try {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
      themes.push({
        name: info.name || entry.name,
        lightPath: `/themes/user/${entry.name}/light.css`,
        darkPath:  `/themes/user/${entry.name}/dark.css`,
        path:      `/themes/user/${entry.name}`,
        builtin:   false,
        author:    info.author,
      });
    } catch { continue; }
  }
  return themes;
}

// Upsert the settings row — creates it with defaults if it doesn't exist,
// then applies the partial update. This means every save is safe even on a
// fresh DB, and never overwrites fields it didn't intend to touch.
async function saveSettings(data: Record<string, any>) {
  return prisma.settings.upsert({
    where:  { id: 1 },
    update: data,
    create: {
      title:    'AirLink',
      logo:     '../assets/logo.png',
      favicon:  '../assets/favicon.ico',
      lightTheme: 'default',
      darkTheme:  'default',
      language:   'en',
      allowRegistration:     false,
      uploadLimit:           100,
      rateLimitEnabled:      true,
      rateLimitRpm:          100,
      bannedIps:             '[]',
      allowUserCreateServer: false,
      allowUserDeleteServer: false,
      defaultServerLimit:    0,
      defaultMaxMemory:      512,
      defaultMaxCpu:         100,
      defaultMaxStorage:     5,
      loginMaxAttempts:      5,
      loginLockoutMinutes:   15,
      enforceDaemonHttps:    false,
      behindReverseProxy:    false,
      hashApiKeys:           false,
      ...data,
    },
  });
}

const adminModule: Module = {
  info: {
    name:          'Admin Settings Module',
    description:   'Settings management for the admin panel.',
    version:       '1.0.0',
    moduleVersion: '1.0.0',
    author:        'AirlinkLab',
    license:       'MIT',
  },

  router: () => {
    const router = Router();

    // ── GET /admin/settings ─────────────────────────────────────────────────
    router.get(
      '/admin/settings',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          const builtinThemesDir = path.join(process.cwd(), 'public', 'themes');
          const builtinThemes = fs.readdirSync(builtinThemesDir)
            .filter(f => f.endsWith('.css'))
            .map(f => ({ name: f.replace('.css', ''), path: `/themes/${f}`, builtin: true }));

          const allThemes = [
            { name: 'default', path: null, builtin: true },
            ...builtinThemes,
            ...loadUserThemes(),
          ];

          res.render('admin/settings/settings', { user, req, settings, allThemes });
        } catch (error) {
          logger.error('Error loading settings page:', error);
          res.redirect('/login');
        }
      },
    );

    // ── GET /admin/settings/example-theme ───────────────────────────────────
    router.get(
      '/admin/settings/example-theme',
      isAuthenticated(true),
      async (_req: Request, res: Response) => {
        try {
          const zipDir = path.join(process.cwd(), 'public', 'uploads', 'theme-zips');
          fs.mkdirSync(zipDir, { recursive: true });
          const archivePath = path.join(zipDir, 'example-theme-' + Date.now() + '.zip');
          const info = { name: 'Example Theme', author: 'Your Name', updatedAt: new Date().toISOString().split('T')[0] };
          const zip = new AdmZip();
          zip.addFile('info.json', Buffer.from(JSON.stringify(info, null, 2)));
          zip.addFile('light.css', Buffer.from('/* light mode theme */\n:root {}\n'));
          zip.addFile('dark.css',  Buffer.from('/* dark mode theme */\n:root {}\n'));
          zip.writeZip(archivePath);
          res.download(archivePath, 'example-theme.zip', () => fs.rmSync(archivePath, { force: true }));
        } catch (error) {
          logger.error('Error generating example theme:', error);
          res.status(500).json({ error: 'Failed to generate example theme.' });
        }
      },
    );

    // ── POST /admin/settings (appearance: logo, favicon, themes, wallpapers) ─
    router.post(
      '/admin/settings',
      isAuthenticated(true),
      upload.fields([
        { name: 'logo',                 maxCount: 1 },
        { name: 'favicon',              maxCount: 1 },
        { name: 'themeFile',            maxCount: 1 },
        { name: 'loginWallpaperFile',   maxCount: 1 },
        { name: 'registerWallpaperFile', maxCount: 1 },
      ]),
      async (req, res) => {
        try {
          const raw   = req.body;
          const files = req.files as Record<string, Express.Multer.File[]>;

          if (files.themeFile?.[0]) {
            const result = installThemeZip(files.themeFile[0].path);
            if (!result.success) return res.status(400).json({ success: false, error: result.error });
          }

          const data: Record<string, any> = {};

          if (typeof raw.title === 'string') data.title = raw.title;
          if (typeof raw.allowRegistration !== 'undefined') {
            data.allowRegistration = raw.allowRegistration === 'true' || raw.allowRegistration === true;
          }
          if (typeof raw.lightTheme === 'string') data.lightTheme = raw.lightTheme;
          if (typeof raw.darkTheme  === 'string') data.darkTheme  = raw.darkTheme;
          if (raw.uploadLimit) data.uploadLimit = parseInt(raw.uploadLimit, 10) || 100;
          if (typeof raw.virusTotalApiKey === 'string') {
            data.virusTotalApiKey = raw.virusTotalApiKey.trim() || null;
          }

          if (files.logo?.[0])    data.logo    = `/uploads/logos/${files.logo[0].filename}`;
          if (files.favicon?.[0]) {
            data.favicon = `/uploads/favicons/${files.favicon[0].filename}`;
            fs.copyFileSync(files.favicon[0].path, path.join(process.cwd(), 'public', 'favicon.ico'));
          }

          // Wallpapers: uploaded file > URL input > no change
          if (files.loginWallpaperFile?.[0]) {
            data.loginWallpaper = `/uploads/wallpapers/${files.loginWallpaperFile[0].filename}`;
          } else if (typeof raw.loginWallpaperUrl === 'string') {
            const u = raw.loginWallpaperUrl.trim();
            if (u === '') data.loginWallpaper = null;
            else if (u.startsWith('http')) data.loginWallpaper = u;
          }

          if (files.registerWallpaperFile?.[0]) {
            data.registerWallpaper = `/uploads/wallpapers/${files.registerWallpaperFile[0].filename}`;
          } else if (typeof raw.registerWallpaperUrl === 'string') {
            const u = raw.registerWallpaperUrl.trim();
            if (u === '') data.registerWallpaper = null;
            else if (u.startsWith('http')) data.registerWallpaper = u;
          }

          if (Object.keys(data).length > 0) await saveSettings(data);
          res.json({ success: true });
        } catch (error) {
          logger.error('Error saving appearance settings:', error);
          res.status(500).json({ success: false, error: 'Failed to save settings.' });
        }
      },
    );

    // ── POST /admin/settings/general (allowRegistration) ────────────────────
    router.post(
      '/admin/settings/general',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const data: Record<string, any> = {
            allowRegistration: req.body.allowRegistration === true,
          };
          if (req.body.uploadLimit) {
            data.uploadLimit = parseInt(req.body.uploadLimit, 10) || 100;
          }
          if (typeof req.body.virusTotalApiKey === 'string') {
            data.virusTotalApiKey = req.body.virusTotalApiKey.trim() || null;
          }
          await saveSettings(data);
          res.json({ success: true });
        } catch (error) {
          logger.error('Error saving general settings:', error);
          res.status(500).json({ success: false, error: 'Failed to save settings.' });
        }
      },
    );

    // ── POST /admin/settings/security ───────────────────────────────────────
    router.post(
      '/admin/settings/security',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const rateLimitEnabled    = req.body.rateLimitEnabled === true || req.body.rateLimitEnabled === 'true';
          const rateLimitRpm        = parseInt(req.body.rateLimitRpm, 10);
          const loginMaxAttempts    = parseInt(req.body.loginMaxAttempts, 10);
          const loginLockoutMinutes = parseInt(req.body.loginLockoutMinutes, 10);
          const enforceDaemonHttps  = req.body.enforceDaemonHttps === true;
          const behindReverseProxy  = req.body.behindReverseProxy  === true;
          const hashApiKeys         = req.body.hashApiKeys          === true;

          if (isNaN(rateLimitRpm) || rateLimitRpm < 1 || rateLimitRpm > 10000) {
            return res.status(400).json({ success: false, error: 'RPM must be between 1 and 10000.' });
          }
          if (isNaN(loginMaxAttempts) || loginMaxAttempts < 1 || loginMaxAttempts > 100) {
            return res.status(400).json({ success: false, error: 'Max attempts must be between 1 and 100.' });
          }
          if (isNaN(loginLockoutMinutes) || loginLockoutMinutes < 1 || loginLockoutMinutes > 1440) {
            return res.status(400).json({ success: false, error: 'Lockout must be between 1 and 1440 minutes.' });
          }

          const securityData: Record<string, any> = {
            rateLimitEnabled,
            rateLimitRpm,
            loginMaxAttempts,
            loginLockoutMinutes,
            enforceDaemonHttps,
            behindReverseProxy,
            hashApiKeys,
          };
          if (typeof req.body.virusTotalApiKey === 'string') {
            securityData.virusTotalApiKey = req.body.virusTotalApiKey.trim() || null;
          }
          await saveSettings(securityData);
          res.json({ success: true });
        } catch (error) {
          logger.error('Error saving security settings:', error);
          res.status(500).json({ success: false, error: 'Failed to save settings.' });
        }
      },
    );

    // ── POST /admin/settings/server-policy ──────────────────────────────────
    router.post(
      '/admin/settings/server-policy',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const allowUserCreateServer = req.body.allowUserCreateServer === true || req.body.allowUserCreateServer === 'true';
          const allowUserDeleteServer = req.body.allowUserDeleteServer === true || req.body.allowUserDeleteServer === 'true';
          const defaultServerLimit    = parseInt(req.body.defaultServerLimit, 10);
          const defaultMaxMemory      = parseInt(req.body.defaultMaxMemory,   10);
          const defaultMaxCpu         = parseInt(req.body.defaultMaxCpu,      10);
          const defaultMaxStorage     = parseInt(req.body.defaultMaxStorage,  10);

          if (isNaN(defaultServerLimit) || defaultServerLimit < 0)
            return res.status(400).json({ success: false, error: 'Server limit must be 0 or greater.' });
          if (isNaN(defaultMaxMemory) || defaultMaxMemory < 128)
            return res.status(400).json({ success: false, error: 'Max memory must be at least 128 MB.' });
          if (isNaN(defaultMaxCpu) || defaultMaxCpu < 10)
            return res.status(400).json({ success: false, error: 'Max CPU must be at least 10%.' });
          if (isNaN(defaultMaxStorage) || defaultMaxStorage < 1)
            return res.status(400).json({ success: false, error: 'Max storage must be at least 1 GB.' });

          const serverPolicyData: Record<string, any> = {
            allowUserCreateServer,
            allowUserDeleteServer,
            defaultServerLimit,
            defaultMaxMemory,
            defaultMaxCpu,
            defaultMaxStorage,
          };
          if (req.body.uploadLimit) {
            serverPolicyData.uploadLimit = parseInt(req.body.uploadLimit, 10) || 100;
          }
          await saveSettings(serverPolicyData);
          res.json({ success: true });
        } catch (error) {
          logger.error('Error saving server policy:', error);
          res.status(500).json({ success: false, error: 'Failed to save server policy.' });
        }
      },
    );

    // ── POST /admin/settings/ban-ip ─────────────────────────────────────────
    router.post(
      '/admin/settings/ban-ip',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { ip } = req.body;
          if (!ip || typeof ip !== 'string' || !/^[\d.:a-fA-F]+$/.test(ip))
            return res.status(400).json({ success: false, error: 'Invalid IP address.' });
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          let banned: string[] = [];
          try { banned = JSON.parse(settings?.bannedIps || '[]'); } catch { banned = []; }
          if (!banned.includes(ip)) {
            banned.push(ip);
            await saveSettings({ bannedIps: JSON.stringify(banned) });
          }
          res.json({ success: true, banned });
        } catch (error) {
          logger.error('Error banning IP:', error);
          res.status(500).json({ success: false, error: 'Failed to ban IP.' });
        }
      },
    );

    // ── POST /admin/settings/unban-ip ───────────────────────────────────────
    router.post(
      '/admin/settings/unban-ip',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { ip } = req.body;
          if (!ip || typeof ip !== 'string')
            return res.status(400).json({ success: false, error: 'IP is required.' });
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          let banned: string[] = [];
          try { banned = JSON.parse(settings?.bannedIps || '[]'); } catch { banned = []; }
          await saveSettings({ bannedIps: JSON.stringify(banned.filter(b => b !== ip)) });
          res.json({ success: true, banned: banned.filter(b => b !== ip) });
        } catch (error) {
          logger.error('Error unbanning IP:', error);
          res.status(500).json({ success: false, error: 'Failed to unban IP.' });
        }
      },
    );

    // ── POST /admin/settings/reset ──────────────────────────────────────────
    router.post(
      '/admin/settings/reset',
      isAuthenticated(true),
      async (_req: Request, res: Response) => {
        try {
          await saveSettings({
            title:             'Airlink',
            logo:              '../assets/logo.png',
            favicon:           '../assets/favicon.ico',
            lightTheme:        'default',
            darkTheme:         'default',
            language:          'en',
            allowRegistration: false,
            loginWallpaper:    null,
            registerWallpaper: null,
          });
          const defaultFavicon = path.join(process.cwd(), 'public', 'assets', 'favicon.ico');
          const dest           = path.join(process.cwd(), 'public', 'favicon.ico');
          if (fs.existsSync(defaultFavicon)) fs.copyFileSync(defaultFavicon, dest);
          res.json({ success: true });
        } catch (error) {
          logger.error('Error resetting settings:', error);
          res.status(500).json({ success: false, error: 'Failed to reset settings.' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
