import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { refreshSecurityCache } from '../../handlers/securityCache';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import nodemailer from 'nodemailer';
import { testS3Connection } from '../../handlers/utils/core/s3Client';
import { safeClientMessage } from '../../utils/errors';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const BCRYPT_SALT_ROUNDS = 12;

const MIME_TYPE_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const;

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

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.fieldname === 'themeFile') {
    const ext = path.extname(file.originalname).toLowerCase();
    return cb(null, ext === '.zip' || file.mimetype.includes('zip'));
  }
  cb(null, (MIME_TYPE_ALLOWLIST as readonly string[]).includes(file.mimetype));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } });

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
    JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
    const themeId  = randomUUID();
    const themeDir = path.join(themesDir, themeId);
    fs.mkdirSync(themeDir, { recursive: true });
    fs.copyFileSync(infoPath, path.join(themeDir, 'info.json'));
    fs.copyFileSync(lightPath, path.join(themeDir, 'light.css'));
    fs.copyFileSync(darkPath, path.join(themeDir, 'dark.css'));
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof SyntaxError) return { success: false, error: 'info.json contains invalid JSON.' };
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.startsWith('Theme zip')) return { success: false, error: errMsg };
    return { success: false, error: 'Failed to extract theme zip.' };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  }
}

type UserTheme = {
  name: string;
  lightPath: string;
  darkPath: string;
  path: string;
  builtin: boolean;
  author?: string;
};

function loadUserThemes(): UserTheme[] {
  const dir = path.join(process.cwd(), 'public', 'themes', 'user');
  if (!fs.existsSync(dir)) return [];
  const themes: UserTheme[] = [];
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
async function saveSettings(data: Record<string, unknown>) {
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
      rateLimitRpm:          500,
      bannedIps:             '[]',
      allowUserCreateServer: false,
      allowUserDeleteServer: false,
      defaultServerLimit:    0,
      defaultMaxMemory:      512,
      defaultMaxCpu:         100,
      defaultMaxStorage:     5120,
      loginMaxAttempts:      5,
      loginLockoutMinutes:   15,
      enforceDaemonHttps:    false,
      require2faForAdmins:   false,
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
    version:       '2.0.0',
    moduleVersion: '2.0.0',
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
        } catch (error: unknown) {
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
        } catch (error: unknown) {
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

          const data: Record<string, unknown> = {};

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
          return res.json({ success: true });
        } catch (error: unknown) {
          logger.error('Error saving appearance settings:', error);
          res.status(500).json({ success: false, error: 'Failed to save settings.' });
          return;
        }
      },
    );

    // ── POST /admin/settings/general (allowRegistration) ────────────────────
    router.post(
      '/admin/settings/general',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const data: Record<string, unknown> = {
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
        } catch (error: unknown) {
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
          const require2faForAdmins = req.body.require2faForAdmins === true;
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

          const securityData: Record<string, unknown> = {
            rateLimitEnabled,
            rateLimitRpm,
            loginMaxAttempts,
            loginLockoutMinutes,
            enforceDaemonHttps,
            require2faForAdmins,
            behindReverseProxy,
            hashApiKeys,
          };
          if (typeof req.body.virusTotalApiKey === 'string') {
            securityData.virusTotalApiKey = req.body.virusTotalApiKey.trim() || null;
          }
          await saveSettings(securityData);
          await refreshSecurityCache();
          return res.json({ success: true });
        } catch (error: unknown) {
          logger.error('Error saving security settings:', error);
          res.status(500).json({ success: false, error: 'Failed to save settings.' });
          return;
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
          const defaultMaxDatabases   = parseInt(req.body.defaultMaxDatabases, 10);
          const defaultOverallocateMemory = parseInt(req.body.defaultOverallocateMemory, 10);
          const defaultOverallocateDisk   = parseInt(req.body.defaultOverallocateDisk, 10);
          const defaultOverallocateCpu    = parseInt(req.body.defaultOverallocateCpu, 10);

          if (isNaN(defaultServerLimit) || defaultServerLimit < 0)
            return res.status(400).json({ success: false, error: 'Server limit must be 0 or greater.' });
          if (isNaN(defaultMaxMemory) || defaultMaxMemory < 128)
            return res.status(400).json({ success: false, error: 'Max memory must be at least 128 MB.' });
          if (isNaN(defaultMaxCpu) || defaultMaxCpu < 10)
            return res.status(400).json({ success: false, error: 'Max CPU must be at least 10%.' });
          if (isNaN(defaultMaxStorage) || defaultMaxStorage < 128)
            return res.status(400).json({ success: false, error: 'Max storage must be at least 128 MB.' });
          if (isNaN(defaultMaxDatabases) || defaultMaxDatabases < 0)
            return res.status(400).json({ success: false, error: 'Default max databases must be 0 or greater.' });
          if ([defaultOverallocateMemory, defaultOverallocateDisk, defaultOverallocateCpu].some((v) => isNaN(v) || v < 0 || v > 10000))
            return res.status(400).json({ success: false, error: 'Overallocation defaults must be between 0 and 10000%.' });

          const serverPolicyData: Record<string, unknown> = {
            allowUserCreateServer,
            allowUserDeleteServer,
            defaultServerLimit,
            defaultMaxMemory,
            defaultMaxCpu,
            defaultMaxStorage,
            defaultMaxDatabases,
            defaultOverallocateMemory,
            defaultOverallocateDisk,
            defaultOverallocateCpu,
          };
          if (req.body.uploadLimit) {
            serverPolicyData.uploadLimit = parseInt(req.body.uploadLimit, 10) || 100;
          }
          await saveSettings(serverPolicyData);
          return res.json({ success: true });
        } catch (error: unknown) {
          logger.error('Error saving server policy:', error);
          res.status(500).json({ success: false, error: 'Failed to save server policy.' });
          return;
        }
      },
    );

    // ── POST /admin/settings/smtp ───────────────────────────────────────────
    router.post(
      '/admin/settings/smtp',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const smtpPort = parseInt(req.body.smtpPort, 10);
          if (isNaN(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
            return res.status(400).json({ success: false, error: 'SMTP port must be between 1 and 65535.' });
          }

          const smtpData: Record<string, unknown> = {
            smtpHost:     typeof req.body.smtpHost === 'string' ? req.body.smtpHost.trim() || null : null,
            smtpPort,
            smtpUser:     typeof req.body.smtpUser === 'string' ? req.body.smtpUser.trim() || null : null,
            smtpPassword: typeof req.body.smtpPassword === 'string' ? req.body.smtpPassword || null : null,
            smtpFrom:     typeof req.body.smtpFrom === 'string' ? req.body.smtpFrom.trim() || null : null,
            smtpSecure:   req.body.smtpSecure === true || req.body.smtpSecure === 'true',
          };
          await saveSettings(smtpData);
          return res.json({ success: true });
        } catch (error: unknown) {
          logger.error('Error saving SMTP settings:', error);
          res.status(500).json({ success: false, error: 'Failed to save SMTP settings.' });
          return;
        }
      },
    );

    // ── POST /admin/settings/smtp/test ──────────────────────────────────────
    router.post(
      '/admin/settings/smtp/test',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const smtp = await prisma.settings.findUnique({ where: { id: 1 } });
          if (!smtp?.smtpHost) {
            return res.status(400).json({ success: false, error: 'SMTP is not configured yet.' });
          }
          const transporter = nodemailer.createTransport({
            host: smtp.smtpHost,
            port: smtp.smtpPort ?? 587,
            secure: smtp.smtpSecure,
            auth: { user: smtp.smtpUser ?? '', pass: smtp.smtpPassword ?? '' },
          });
          await transporter.verify();
          return res.json({ success: true, message: 'SMTP connection verified.' });
        } catch (error: unknown) {
          logger.error('SMTP test failed:', error);
          res.status(500).json({ success: false, error: 'SMTP connection failed.' });
          return;
        }
      },
    );

    // ── POST /admin/settings/s3 ────────────────────────────────────────────
    router.post(
      '/admin/settings/s3',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const s3Data: Record<string, unknown> = {
            s3Enabled:    req.body.s3Enabled === true || req.body.s3Enabled === 'true',
            s3Endpoint:   typeof req.body.s3Endpoint === 'string' ? req.body.s3Endpoint.trim() || null : null,
            s3Region:     typeof req.body.s3Region === 'string' ? req.body.s3Region.trim() || null : null,
            s3Bucket:     typeof req.body.s3Bucket === 'string' ? req.body.s3Bucket.trim() || null : null,
            s3AccessKey:  typeof req.body.s3AccessKey === 'string' ? req.body.s3AccessKey.trim() || null : null,
            s3SecretKey:  typeof req.body.s3SecretKey === 'string' ? req.body.s3SecretKey || null : null,
            s3PathStyle:  req.body.s3PathStyle === true || req.body.s3PathStyle === 'true',
          };
          await saveSettings(s3Data);
          return res.json({ success: true });
        } catch (error: unknown) {
          logger.error('Error saving S3 settings:', error);
          res.status(500).json({ success: false, error: 'Failed to save S3 settings.' });
          return;
        }
      },
    );

    // ── POST /admin/settings/s3/test ───────────────────────────────────────
    router.post(
      '/admin/settings/s3/test',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const result = await testS3Connection();
          if (result.success) {
            return res.json({ success: true, message: `S3 connection verified (${result.latency}ms).` });
          }
          return res.status(500).json({ success: false, error: result.error ? safeClientMessage(result.error, 'S3 connection failed.') : 'S3 connection failed.' });
        } catch (error: unknown) {
          logger.error('S3 test failed:', error);
          res.status(500).json({ success: false, error: 'S3 connection failed.' });
          return;
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
          return res.json({ success: true, banned });
        } catch (error: unknown) {
          logger.error('Error banning IP:', error);
          res.status(500).json({ success: false, error: 'Failed to ban IP.' });
          return;
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
          return res.json({ success: true, banned: banned.filter(b => b !== ip) });
        } catch (error: unknown) {
          logger.error('Error unbanning IP:', error);
          res.status(500).json({ success: false, error: 'Failed to unban IP.' });
          return;
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
        } catch (error: unknown) {
          logger.error('Error resetting settings:', error);
          res.status(500).json({ success: false, error: 'Failed to reset settings.' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
