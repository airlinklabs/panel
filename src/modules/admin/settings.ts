import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import { isAuthenticated } from '../../middleware/auth.js';
import logger from '../../services/logger.js';
import { refreshSecurityCache } from '../../services/security.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto, { randomUUID } from 'crypto';
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
    if (file.fieldname === 'favicon')  {cb(null, 'favicon' + ext); return;}
    if (file.fieldname === 'themeFile') {cb(null, 'theme-' + Date.now() + '.zip'); return;}
    cb(null, file.fieldname + '-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.fieldname === 'themeFile') {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === '.zip' || file.mimetype.includes('zip')); return;
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
    if (!fs.existsSync(infoPath))  {return { success: false, error: 'Theme zip must contain info.json.' };}
    if (!fs.existsSync(lightPath)) {return { success: false, error: 'Theme zip must contain light.css.' };}
    if (!fs.existsSync(darkPath))  {return { success: false, error: 'Theme zip must contain dark.css.' };}
    JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
    const themeId  = randomUUID();
    const themeDir = path.join(themesDir, themeId);
    fs.mkdirSync(themeDir, { recursive: true });
    fs.copyFileSync(infoPath, path.join(themeDir, 'info.json'));
    fs.copyFileSync(lightPath, path.join(themeDir, 'light.css'));
    fs.copyFileSync(darkPath, path.join(themeDir, 'dark.css'));
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {return { success: false, error: 'info.json contains invalid JSON.' };}
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.startsWith('Theme zip')) {return { success: false, error: msg };}
    return { success: false, error: 'Failed to extract theme zip.' };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  }
}

function loadUserThemes() {
  const dir = path.join(process.cwd(), 'public', 'themes', 'user');
  if (!fs.existsSync(dir)) {return [];}
  const themes: { name: string; lightPath: string; darkPath: string; path: string; builtin: boolean; author?: string }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {continue;}
    const infoPath  = path.join(dir, entry.name, 'info.json');
    const lightPath = path.join(dir, entry.name, 'light.css');
    const darkPath  = path.join(dir, entry.name, 'dark.css');
    if (!fs.existsSync(infoPath) || !fs.existsSync(lightPath) || !fs.existsSync(darkPath)) {continue;}
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
          if (!user) {res.redirect('/login'); return;}

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
          const lightCss = `/*
 * Example Theme — Light Mode
 *
 * Only define CSS variables here. The panel loads theme-base.css
 * automatically which handles all element selectors for you.
 *
 * See THEME.md for the full variable reference.
 */

:root {
  /* --- Page backgrounds --- */
  --theme-bg:               #ffffff;
  --theme-bg-secondary:     #f5f5f5;
  --theme-bg-tertiary:      #ececec;
  --theme-bg-card:          #f9f9f9;
  --theme-bg-hover:         #eeeeee;
  --theme-bg-input:         #f0f0f0;
  --theme-bg-active-nav:    rgba(0, 0, 0, 0.05);

  /* --- Borders --- */
  --theme-border:           #e0e0e0;
  --theme-border-subtle:    rgba(0, 0, 0, 0.06);
  --theme-border-input:     #d4d4d4;
  --theme-border-accent:    rgba(99, 102, 241, 0.25);

  /* --- Text --- */
  --theme-text:             #525252;
  --theme-text-strong:      #171717;
  --theme-text-muted:       #a3a3a3;
  --theme-text-nav:         #737373;
  --theme-text-nav-active:  #171717;
  --theme-text-placeholder: #bbbbbb;
  --theme-text-code:        #7c3aed;
  --theme-text-link:        #4f46e5;

  /* --- Accent / brand --- */
  --theme-accent:           #6366f1;
  --theme-accent-hover:     #4f46e5;
  --theme-accent-text:      #ffffff;
  --theme-accent-subtle:    rgba(99, 102, 241, 0.08);

  /* --- Status colours --- */
  --theme-success:          #16a34a;
  --theme-success-bg:       rgba(22, 163, 74, 0.08);
  --theme-warning:          #d97706;
  --theme-warning-bg:       rgba(217, 119, 6, 0.08);
  --theme-danger:           #dc2626;
  --theme-danger-bg:        rgba(220, 38, 38, 0.06);
  --theme-info:             #2563eb;
  --theme-info-bg:          rgba(37, 99, 235, 0.08);

  /* --- Nav chrome --- */
  --theme-nav-bg:           #f5f5f5;
  --theme-nav-border:       #e0e0e0;
  --theme-nav-text:         #737373;
  --theme-nav-text-active:  #171717;
  --theme-nav-icon:         #a3a3a3;
  --theme-nav-icon-active:  #4f46e5;

  /* --- Table --- */
  --theme-table-header-bg:  #f9f9f9;
  --theme-table-row-hover:  rgba(0, 0, 0, 0.02);
  --theme-table-divide:     #eeeeee;

  /* --- Badges / pills --- */
  --theme-badge-neutral-bg:   rgba(0, 0, 0, 0.06);
  --theme-badge-neutral-text: #525252;
  --theme-badge-blue-bg:      rgba(99, 102, 241, 0.08);
  --theme-badge-blue-text:    #4f46e5;

  /* --- Buttons --- */
  --theme-btn-secondary-bg:     #f5f5f5;
  --theme-btn-secondary-border: #e0e0e0;
  --theme-btn-secondary-text:   #525252;
  --theme-btn-secondary-hover:  #eeeeee;

  /* --- Toggle / switch --- */
  --theme-toggle-track:     #d4d4d4;
  --theme-toggle-dot:       #ffffff;

  /* --- Search --- */
  --theme-search-bg:        #f0f0f0;
  --theme-search-border:    #e0e0e0;
  --theme-search-text:      #525252;
  --theme-search-results:   #ffffff;

  /* --- Scrollbar --- */
  --theme-scrollbar-track:  #ffffff;
  --theme-scrollbar-thumb:  #e0e0e0;

  /* --- Logo background --- */
  --theme-logo-bg:          rgba(0, 0, 0, 0.08);

  /* --- Code / terminal --- */
  --theme-code-bg:          #f5f5f5;
  --theme-code-text:        #7c3aed;
  --theme-code-border:      #e0e0e0;

  /* --- Typography --- */
  --theme-font-family:      'General Sans', ui-sans-serif, system-ui, sans-serif;

  /* --- Border radius --- */
  --theme-radius:           0.75rem;
  --theme-radius-lg:        1rem;
  --theme-radius-root:      0;

  /* --- Shadows --- */
  --theme-shadow:           0 6px 12px -10px rgb(0 0 0 / 0.32);
  --theme-shadow-lg:        0 8px 18px -14px rgb(0 0 0 / 0.34);
  --theme-shadow-xl:        0 18px 44px -28px rgb(0 0 0 / 0.45);

  /* --- Transitions --- */
  --theme-transition:       150ms;
  --theme-transition-easing: cubic-bezier(0.4, 0, 0.2, 1);
}
`;
          const darkCss = `/*
 * Example Theme — Dark Mode
 *
 * Only define CSS variables here. The panel loads theme-base.css
 * automatically which handles all element selectors for you.
 *
 * See THEME.md for the full variable reference.
 */

:root {
  /* --- Page backgrounds --- */
  --theme-bg:               #0f0f0f;
  --theme-bg-secondary:     #1a1a1a;
  --theme-bg-tertiary:      #222222;
  --theme-bg-card:          #1a1a1a;
  --theme-bg-hover:         #252525;
  --theme-bg-input:         #141414;
  --theme-bg-active-nav:    rgba(255, 255, 255, 0.06);

  /* --- Borders --- */
  --theme-border:           #2a2a2a;
  --theme-border-subtle:    rgba(255, 255, 255, 0.05);
  --theme-border-input:     #333333;
  --theme-border-accent:    rgba(99, 102, 241, 0.30);

  /* --- Text --- */
  --theme-text:             #a3a3a3;
  --theme-text-strong:      #f0f0f0;
  --theme-text-muted:       #666666;
  --theme-text-nav:         #707070;
  --theme-text-nav-active:  #f0f0f0;
  --theme-text-placeholder: #555555;
  --theme-text-code:        #a78bfa;
  --theme-text-link:        #818cf8;

  /* --- Accent / brand --- */
  --theme-accent:           #6366f1;
  --theme-accent-hover:     #818cf8;
  --theme-accent-text:      #ffffff;
  --theme-accent-subtle:    rgba(99, 102, 241, 0.12);

  /* --- Status colours --- */
  --theme-success:          #22c55e;
  --theme-success-bg:       rgba(34, 197, 94, 0.12);
  --theme-warning:          #f59e0b;
  --theme-warning-bg:       rgba(245, 158, 11, 0.12);
  --theme-danger:           #ef4444;
  --theme-danger-bg:        rgba(239, 68, 68, 0.12);
  --theme-info:             #3b82f6;
  --theme-info-bg:          rgba(59, 130, 246, 0.12);

  /* --- Nav chrome --- */
  --theme-nav-bg:           #111111;
  --theme-nav-border:       #2a2a2a;
  --theme-nav-text:         #606060;
  --theme-nav-text-active:  #f0f0f0;
  --theme-nav-icon:         #555555;
  --theme-nav-icon-active:  #818cf8;

  /* --- Table --- */
  --theme-table-header-bg:  #161616;
  --theme-table-row-hover:  rgba(99, 102, 241, 0.05);
  --theme-table-divide:     #222222;

  /* --- Badges / pills --- */
  --theme-badge-neutral-bg:   rgba(163, 163, 163, 0.10);
  --theme-badge-neutral-text: #a3a3a3;
  --theme-badge-blue-bg:      rgba(99, 102, 241, 0.14);
  --theme-badge-blue-text:    #a5b4fc;

  /* --- Buttons --- */
  --theme-btn-secondary-bg:     #1e1e1e;
  --theme-btn-secondary-border: #2a2a2a;
  --theme-btn-secondary-text:   #a3a3a3;
  --theme-btn-secondary-hover:  #282828;

  /* --- Toggle / switch --- */
  --theme-toggle-track:     #333333;
  --theme-toggle-dot:       #a3a3a3;

  /* --- Search --- */
  --theme-search-bg:        #141414;
  --theme-search-border:    #2a2a2a;
  --theme-search-text:      #a3a3a3;
  --theme-search-results:   #1a1a1a;

  /* --- Scrollbar --- */
  --theme-scrollbar-track:  #0f0f0f;
  --theme-scrollbar-thumb:  #2a2a2a;

  /* --- Logo background --- */
  --theme-logo-bg:          transparent;

  /* --- Code / terminal --- */
  --theme-code-bg:          #0a0a0a;
  --theme-code-text:        #a78bfa;
  --theme-code-border:      #222222;

  /* --- Typography --- */
  --theme-font-family:      'General Sans', ui-sans-serif, system-ui, sans-serif;

  /* --- Border radius --- */
  --theme-radius:           0.75rem;
  --theme-radius-lg:        1rem;
  --theme-radius-root:      0;

  /* --- Shadows --- */
  --theme-shadow:           0 6px 12px -10px rgb(0 0 0 / 0.32);
  --theme-shadow-lg:        0 8px 18px -14px rgb(0 0 0 / 0.34);
  --theme-shadow-xl:        0 18px 44px -28px rgb(0 0 0 / 0.45);

  /* --- Transitions --- */
  --theme-transition:       150ms;
  --theme-transition-easing: cubic-bezier(0.4, 0, 0.2, 1);
}
`;
          const zip = new AdmZip();
          zip.addFile('info.json', Buffer.from(JSON.stringify(info, null, 2)));
          zip.addFile('light.css', Buffer.from(lightCss));
          zip.addFile('dark.css', Buffer.from(darkCss));
          zip.writeZip(archivePath);
          res.download(archivePath, 'example-theme.zip', () => { fs.rmSync(archivePath, { force: true }); });
        } catch (error) {
          logger.error('Error generating example theme:', error);
          res.status(500).json({ error: 'Failed to generate example theme.' });
        }
      },
    );

    // ── DELETE /admin/settings/theme/:id ────────────────────────────────────
    router.delete(
      '/admin/settings/theme/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const themeId = String(req.params.id);
          if (!themeId || themeId === 'default') {
            return res.status(400).json({ success: false, error: 'Cannot delete the default theme.' });
          }
          const themeDir = path.join(process.cwd(), 'public', 'themes', 'user', themeId);
          if (!fs.existsSync(themeDir)) {
            return res.status(404).json({ success: false, error: 'Theme not found.' });
          }
          fs.rmSync(themeDir, { recursive: true, force: true });

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          const update: Record<string, unknown> = {};
          if (settings?.lightTheme?.includes(`/user/${themeId}/`)) {update.lightTheme = 'default';}
          if (settings?.darkTheme?.includes(`/user/${themeId}/`)) {update.darkTheme = 'default';}
          if (Object.keys(update).length > 0) {await saveSettings(update);}

          res.json({ success: true });
        } catch (error) {
          logger.error('Error deleting theme:', error);
          res.status(500).json({ success: false, error: 'Failed to delete theme.' });
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
            if (!result.success) {return res.status(400).json({ success: false, error: result.error });}
          }

          const data: Record<string, unknown> = {};

          if (typeof raw.title === 'string') {data.title = raw.title;}
          if (typeof raw.allowRegistration !== 'undefined') {
            data.allowRegistration = raw.allowRegistration === 'true' || raw.allowRegistration === true;
          }
          if (typeof raw.lightTheme === 'string') {data.lightTheme = raw.lightTheme;}
          if (typeof raw.darkTheme  === 'string') {data.darkTheme  = raw.darkTheme;}
          if (raw.uploadLimit) {data.uploadLimit = parseInt(raw.uploadLimit, 10) || 100;}
          if (typeof raw.virusTotalApiKey === 'string') {
            data.virusTotalApiKey = raw.virusTotalApiKey.trim() || null;
          }

          if (files.logo?.[0])    {data.logo    = `/uploads/logos/${files.logo[0].filename}`;}
          if (files.favicon?.[0]) {
            data.favicon = `/uploads/favicons/${files.favicon[0].filename}`;
            fs.copyFileSync(files.favicon[0].path, path.join(process.cwd(), 'public', 'favicon.ico'));
          }

          // Wallpapers: uploaded file > URL input > no change
          if (files.loginWallpaperFile?.[0]) {
            data.loginWallpaper = `/uploads/wallpapers/${files.loginWallpaperFile[0].filename}`;
          } else if (typeof raw.loginWallpaperUrl === 'string') {
            const u = raw.loginWallpaperUrl.trim();
            if (u === '') {data.loginWallpaper = null;}
            else if (u.startsWith('http')) {data.loginWallpaper = u;}
          }

          if (files.registerWallpaperFile?.[0]) {
            data.registerWallpaper = `/uploads/wallpapers/${files.registerWallpaperFile[0].filename}`;
          } else if (typeof raw.registerWallpaperUrl === 'string') {
            const u = raw.registerWallpaperUrl.trim();
            if (u === '') {data.registerWallpaper = null;}
            else if (u.startsWith('http')) {data.registerWallpaper = u;}
          }

          if (Object.keys(data).length > 0) {await saveSettings(data);}
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

          const securityData: Record<string, unknown> = {
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
          await refreshSecurityCache();
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
          {return res.status(400).json({ success: false, error: 'Server limit must be 0 or greater.' });}
          if (isNaN(defaultMaxMemory) || defaultMaxMemory < 128)
          {return res.status(400).json({ success: false, error: 'Max memory must be at least 128 MB.' });}
          if (isNaN(defaultMaxCpu) || defaultMaxCpu < 10)
          {return res.status(400).json({ success: false, error: 'Max CPU must be at least 10%.' });}
          if (isNaN(defaultMaxStorage) || defaultMaxStorage < 128)
          {return res.status(400).json({ success: false, error: 'Max storage must be at least 128 MB.' });}

          const serverPolicyData: Record<string, unknown> = {
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
          {return res.status(400).json({ success: false, error: 'Invalid IP address.' });}
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
          {return res.status(400).json({ success: false, error: 'IP is required.' });}
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
          if (fs.existsSync(defaultFavicon)) {fs.copyFileSync(defaultFavicon, dest);}
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
