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

function validateThemeCustomizations(value: any): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return 'Unsupported theme customization format.';
  const safeSVG = (svg: any) => {
    if (typeof svg !== 'string' || svg.length > 100000 || !/^\s*<svg[\s/>]/.test(svg) || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(svg)) return false;
    const tags = new Set(['svg','g','path','circle','rect','line','polyline','polygon','ellipse','defs','clipPath','mask','linearGradient','radialGradient','stop','title','desc']);
    const attributes = new Set(['class','role','aria-hidden','aria-label','focusable','viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','stroke-opacity','opacity','transform','clip-path','clip-rule','mask','id','offset','stop-color','stop-opacity','gradientUnits','gradientTransform','spreadMethod','fx','fy','fr','clipPathUnits','maskUnits','maskContentUnits','preserveAspectRatio','vector-effect']);
    const text = svg.replace(/<!--[\s\S]*?-->/g, ''), stack: string[] = [];let position = 0, roots = 0, count = 0;
    for (const token of text.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^<>]*?)>/g)) {
      if (++count > 2000 || !stack.length && text.slice(position, token.index).trim()) return false;
      const closing = token[1] === '/', tag = token[2], selfClosing = /\/\s*$/.test(token[3]);
      if (!tags.has(tag)) return false;
      if (closing) { if (token[3].trim() || stack.pop() !== tag) return false; }
      else {
        if (!stack.length && (tag !== 'svg' || ++roots > 1)) return false;
        let valid = true;
        const remaining = token[3].replace(/\/\s*$/, '').replace(/\s+([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g, (_all, name, _quote, data) => {
          if (name === 'xmlns') { if (data !== 'http://www.w3.org/2000/svg') valid = false;return ''; }
          if (!attributes.has(name) || /[&\\]|(?:javascript:|data:|https?:|\/\/|expression\s*\()/i.test(data) || /url\s*\(/i.test(data) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(data.trim())) valid = false;
          return '';
        });
        if (!valid || remaining.trim()) return false;
        if (!selfClosing) stack.push(tag);
      }
      position = token.index + token[0].length;
    }
    return roots === 1 && !stack.length && !text.slice(position).trim();
  };
  const safeImage = (url: any) => {
    if (typeof url !== 'string' || !url.trim() || url.length > 3000000 || /[\u0000-\u001f]/.test(url)) return false;
    if (/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);base64,[a-z0-9+/=]+$/i.test(url)) return true;
    if (/^data:image\/svg\+xml(?:;base64)?,/i.test(url)) { try { const comma = url.indexOf(',');return safeSVG(/;base64$/i.test(url.slice(0,comma)) ? Buffer.from(url.slice(comma+1),'base64').toString('utf8') : decodeURIComponent(url.slice(comma+1))); } catch { return false; } }
    try { return ['http:', 'https:'].includes(new URL(url, 'https://airlink.invalid').protocol); } catch { return false; }
  };
  for (const mode of ['light', 'dark']) {
    if (!Array.isArray(value[mode]) || value[mode].length > 500) return 'Each appearance supports up to 500 theme customizations.';
    for (const item of value[mode]) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.selector !== 'string' || !item.selector.trim() || item.selector.length > 6000) return 'A theme customization needs a valid selector.';
      if (Object.prototype.hasOwnProperty.call(item, 'match')) {
        if (!item.match || typeof item.match !== 'object' || Array.isArray(item.match)) return 'Invalid original content match.';
        for (const [kind, content] of Object.entries(item.match)) if (!['text', 'image', 'icon'].includes(kind) || typeof content !== 'string' || content.length > 3000000) return 'Invalid original content match.';
      }
      if (Object.prototype.hasOwnProperty.call(item, 'text') && (typeof item.text !== 'string' || item.text.length > 10000)) return 'Theme text must be at most 10000 characters.';
      if (Object.prototype.hasOwnProperty.call(item, 'texts')) {
        if (!item.texts || typeof item.texts !== 'object' || Array.isArray(item.texts) || Object.keys(item.texts).length > 50) return 'Invalid translated theme texts.';
        for (const [language, text] of Object.entries(item.texts)) if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(language) || typeof text !== 'string' || text.length > 10000) return 'Invalid translated theme texts.';
      }
      if (Object.prototype.hasOwnProperty.call(item, 'image') && !safeImage(item.image)) return 'Theme images must use a safe image URL or raster image data.';
      if (Object.prototype.hasOwnProperty.call(item, 'icon') && !safeSVG(item.icon)) return 'Theme icons must be safe inline SVG geometry.';
      if (Object.prototype.hasOwnProperty.call(item, 'remove') && typeof item.remove !== 'boolean') return 'Theme removal settings must be true or false.';
    }
  }
  return null;
}

function saveTheme(themesDir: string, info: any, light: string, dark: string, customizations: any): string {
  const themeId  = randomUUID();
  const themeDir = path.join(themesDir, themeId);
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, 'info.json'), JSON.stringify(info, null, 2));
  fs.writeFileSync(path.join(themeDir, 'light.css'), light);
  fs.writeFileSync(path.join(themeDir, 'dark.css'), dark);
  if (customizations) fs.writeFileSync(path.join(themeDir, 'customizations.json'), JSON.stringify(customizations));
  return themeId;
}

const THEME_STORE_REPO = /^[\w.-]+\/[\w.-]+$/.test(process.env.THEME_STORE_REPO || '') ? String(process.env.THEME_STORE_REPO) : 'airlinklabs/themes';
const THEME_STORE_RAW  = `https://raw.githubusercontent.com/${THEME_STORE_REPO}/main`;
const THEME_STORE_API  = `https://api.github.com/repos/${THEME_STORE_REPO}`;
const THEME_STORE_HEADERS = { 'User-Agent': 'airlink-panel' };

async function fetchThemeStoreFile(slug: string, file: string, limit: number): Promise<string | null> {
  const res = await fetch(`${THEME_STORE_RAW}/${slug}/${file}`, { headers: THEME_STORE_HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not download ${file} (HTTP ${res.status}).`);
  const text = await res.text();
  if (text.length > limit) throw new Error(`${file} is too large.`);
  return text;
}

const THEME_STORE_IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };

function themeStoreImagePath(value: any): string {
  if (typeof value !== 'string') return '';
  const clean = value.trim().replace(/^\.?\//, '');
  if (!/^[\w./-]+\.(png|jpe?g|gif|webp|avif|svg)$/i.test(clean) || clean.split('/').some((part) => !part || part === '.' || part === '..')) return '';
  return clean;
}

function themeStoreImages(slug: string, info: any): string[] {
  const list = Array.isArray(info.images) ? info.images : (info.preview ? [info.preview] : []);
  return list.map(themeStoreImagePath).filter(Boolean).slice(0, 6).map((file: string) => `/admin/themes/store/image/${slug}/${file}`);
}

function installedStoreThemes(): Set<string> {
  const ids = new Set<string>();
  const dir = path.join(process.cwd(), 'public', 'themes', 'user');
  if (!fs.existsSync(dir)) return ids;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const info = JSON.parse(fs.readFileSync(path.join(dir, entry.name, 'info.json'), 'utf-8'));
      if (typeof info?.storeId === 'string') ids.add(info.storeId);
    } catch { continue; }
  }
  return ids;
}

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
    const customizationPath = path.join(tempDir, 'customizations.json');
    if (!fs.existsSync(infoPath))  return { success: false, error: 'Theme zip must contain info.json.' };
    if (!fs.existsSync(lightPath)) return { success: false, error: 'Theme zip must contain light.css.' };
    if (!fs.existsSync(darkPath))  return { success: false, error: 'Theme zip must contain dark.css.' };
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
    if (!info || typeof info !== 'object' || Array.isArray(info)) return { success: false, error: 'info.json must contain theme metadata.' };
    let customizations: any = null;
    if (fs.existsSync(customizationPath)) {
      if (fs.statSync(customizationPath).size > 6000000) return { success: false, error: 'customizations.json must be smaller than 6 MB.' };
      customizations = JSON.parse(fs.readFileSync(customizationPath, 'utf-8'));
      const error = validateThemeCustomizations(customizations);
      if (error) return { success: false, error };
      info.customizations = 'customizations.json';
    } else {
      delete info.customizations;
    }
    saveTheme(themesDir, info, fs.readFileSync(lightPath, 'utf-8'), fs.readFileSync(darkPath, 'utf-8'), customizations);
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

    router.get(
      '/admin/themes/store',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          res.render('admin/themes/store', { user, req, settings });
        } catch (error) {
          logger.error('Error rendering theme store:', error);
          res.redirect('/admin/settings');
        }
      },
    );

    router.get(
      '/admin/themes/store/list',
      isAuthenticated(true),
      async (_req: Request, res: Response) => {
        try {
          const contentsRes = await fetch(`${THEME_STORE_API}/contents`, {
            headers: { ...THEME_STORE_HEADERS, 'Accept': 'application/vnd.github+json' },
          });
          if (contentsRes.status === 404) {
            res.json({ success: true, available: false, repo: THEME_STORE_REPO, themes: [] });
            return;
          }
          if (!contentsRes.ok) {
            res.status(502).json({ success: false, message: `Failed to fetch the theme list from GitHub (HTTP ${contentsRes.status}).` });
            return;
          }
          const contents = await contentsRes.json() as any[];
          const folders = Array.isArray(contents) ? contents.filter((item: any) => item.type === 'dir' && /^[a-z0-9][a-z0-9-_]*$/i.test(item.name)) : [];
          const installed = installedStoreThemes();
          const themes = await Promise.all(folders.map(async (folder: any) => {
            try {
              const text = await fetchThemeStoreFile(folder.name, 'info.json', 100000);
              if (!text) return null;
              const info = JSON.parse(text);
              if (!info || typeof info !== 'object' || Array.isArray(info)) return null;
              return {
                id: folder.name,
                name: typeof info.name === 'string' && info.name.trim() ? info.name : folder.name,
                version: typeof info.version === 'string' ? info.version : '',
                author: typeof info.author === 'string' ? info.author : '',
                description: typeof info.description === 'string' ? info.description : '',
                longDescription: typeof info.longDescription === 'string' ? info.longDescription : (typeof info.description === 'string' ? info.description : ''),
                images: themeStoreImages(folder.name, info),
                content: info.content === true,
                github: `https://github.com/${THEME_STORE_REPO}/tree/main/${folder.name}`,
                installed: installed.has(folder.name),
              };
            } catch {
              return null;
            }
          }));
          res.json({ success: true, available: true, repo: THEME_STORE_REPO, themes: themes.filter(Boolean) });
        } catch (error: any) {
          logger.error('Error fetching theme store list:', error);
          res.status(500).json({ success: false, message: 'The theme store could not be loaded.' });
        }
      },
    );

    router.get(
      /^\/admin\/themes\/store\/image\/([a-z0-9][a-z0-9-_]*)\/(.+)$/i,
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const slug = req.params[0];
        const file = themeStoreImagePath(req.params[1]);
        const type = THEME_STORE_IMAGE_TYPES[file.split('.').pop()?.toLowerCase() || ''];
        if (!file || !type) {
          res.status(404).end();
          return;
        }
        try {
          const imageRes = await fetch(`${THEME_STORE_RAW}/${slug}/${file}`, { headers: THEME_STORE_HEADERS });
          if (!imageRes.ok) {
            res.status(imageRes.status === 404 ? 404 : 502).end();
            return;
          }
          const data = Buffer.from(await imageRes.arrayBuffer());
          if (data.length > 5000000) {
            res.status(413).end();
            return;
          }
          res.set({
            'Content-Type': type,
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=3600',
          });
          res.send(data);
        } catch (error) {
          logger.error('Error fetching theme store image:', error);
          res.status(502).end();
        }
      },
    );

    router.post(
      '/admin/themes/store/install',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const slug = req.body?.slug;
        if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-_]*$/i.test(slug)) {
          res.status(400).json({ success: false, message: 'Invalid theme.' });
          return;
        }
        if (installedStoreThemes().has(slug)) {
          res.status(409).json({ success: false, message: 'This theme is already installed.' });
          return;
        }
        try {
          const [infoText, light, dark, customizationText] = await Promise.all([
            fetchThemeStoreFile(slug, 'info.json', 100000),
            fetchThemeStoreFile(slug, 'light.css', 2000000),
            fetchThemeStoreFile(slug, 'dark.css', 2000000),
            fetchThemeStoreFile(slug, 'customizations.json', 6000000),
          ]);
          if (!infoText || light === null || dark === null) {
            res.status(422).json({ success: false, message: 'This theme is missing info.json, light.css or dark.css.' });
            return;
          }
          let info: any;
          try { info = JSON.parse(infoText); } catch { info = null; }
          if (!info || typeof info !== 'object' || Array.isArray(info)) {
            res.status(422).json({ success: false, message: 'The theme info.json is not valid.' });
            return;
          }
          let customizations: any = null;
          if (customizationText !== null) {
            try { customizations = JSON.parse(customizationText); } catch {
              res.status(422).json({ success: false, message: 'The theme customizations.json is not valid JSON.' });
              return;
            }
            const error = validateThemeCustomizations(customizations);
            if (error) {
              res.status(422).json({ success: false, message: error });
              return;
            }
            info.customizations = 'customizations.json';
          } else {
            delete info.customizations;
          }
          info.storeId = slug;
          saveTheme(path.join(process.cwd(), 'public', 'themes', 'user'), info, light, dark, customizations);
          res.json({ success: true, message: `"${typeof info.name === 'string' && info.name ? info.name : slug}" installed. Choose it under Settings, Appearance.` });
        } catch (error: any) {
          logger.error('Error installing theme from store:', error);
          res.status(502).json({ success: false, message: error?.message || 'The theme could not be installed.' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
