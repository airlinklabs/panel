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
    let uploadDir;

    if (file.fieldname === 'logo') {
      uploadDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
    } else if (file.fieldname === 'favicon') {
      uploadDir = path.join(process.cwd(), 'public', 'uploads', 'favicons');
    } else if (file.fieldname === 'themeFile') {
      uploadDir = path.join(process.cwd(), 'public', 'uploads', 'theme-zips');
    } else {
      uploadDir = path.join(process.cwd(), 'public', 'uploads');
    }

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    if (file.fieldname === 'favicon') {
      cb(null, 'favicon' + ext);
    } else if (file.fieldname === 'themeFile') {
      cb(null, 'theme-' + Date.now() + '.zip');
    } else {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.fieldname === 'themeFile') {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.zip' || file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed for themes.'));
    }
    return;
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

function installThemeZip(zipPath: string): { success: boolean; error?: string } {
  const themesDir = path.join(process.cwd(), 'public', 'themes', 'user');
  const tempDir = path.join(process.cwd(), 'public', 'uploads', 'theme-zips', 'tmp-' + Date.now());

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);

    const infoPath = path.join(tempDir, 'info.json');
    const lightPath = path.join(tempDir, 'light.css');
    const darkPath = path.join(tempDir, 'dark.css');

    if (!fs.existsSync(infoPath)) {
      return { success: false, error: 'Theme zip must contain an info.json file.' };
    }
    if (!fs.existsSync(lightPath)) {
      return { success: false, error: 'Theme zip must contain a light.css file.' };
    }
    if (!fs.existsSync(darkPath)) {
      return { success: false, error: 'Theme zip must contain a dark.css file.' };
    }

    const infoRaw = fs.readFileSync(infoPath, 'utf-8');
    JSON.parse(infoRaw);

    const themeId = randomUUID();
    const themeDir = path.join(themesDir, themeId);
    fs.mkdirSync(themeDir, { recursive: true });

    fs.copyFileSync(infoPath, path.join(themeDir, 'info.json'));
    fs.copyFileSync(lightPath, path.join(themeDir, 'light.css'));
    fs.copyFileSync(darkPath, path.join(themeDir, 'dark.css'));

    return { success: true };
  } catch (err: any) {
    if (err.message && err.message.startsWith('Theme zip')) return { success: false, error: err.message };
    if (err instanceof SyntaxError) return { success: false, error: 'info.json contains invalid JSON.' };
    return { success: false, error: 'Failed to extract theme zip.' };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  }
}

function loadUserThemes(): { name: string; path: string; lightPath: string; darkPath: string; builtin: boolean; author?: string; updatedAt?: string }[] {
  const userThemesDir = path.join(process.cwd(), 'public', 'themes', 'user');
  if (!fs.existsSync(userThemesDir)) return [];

  const themes: { name: string; path: string; lightPath: string; darkPath: string; builtin: boolean; author?: string; updatedAt?: string }[] = [];

  for (const entry of fs.readdirSync(userThemesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const infoPath = path.join(userThemesDir, entry.name, 'info.json');
    const lightPath = path.join(userThemesDir, entry.name, 'light.css');
    const darkPath = path.join(userThemesDir, entry.name, 'dark.css');

    if (!fs.existsSync(infoPath) || !fs.existsSync(lightPath) || !fs.existsSync(darkPath)) continue;

    try {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
      themes.push({
        name: info.name || entry.name,
        lightPath: `/themes/user/${entry.name}/light.css`,
        darkPath: `/themes/user/${entry.name}/dark.css`,
        path: `/themes/user/${entry.name}`,
        builtin: false,
        author: info.author,
        updatedAt: info.updatedAt,
      });
    } catch {
      continue;
    }
  }

  return themes;
}

interface SettingsData {
  title?: string;
  logo?: string;
  favicon?: string;
  theme?: string;
  lightTheme?: string;
  darkTheme?: string;
  allowRegistration?: boolean;
  uploadLimit?: number;
  virusTotalApiKey?: string | null;
}

const adminModule: Module = {
  info: {
    name: 'Admin Nodes Module',
    description: 'This file is for admin functionality of the Nodes.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirlinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/settings',
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

          const builtinThemesDir = path.join(process.cwd(), 'public', 'themes');

          const builtinThemes = fs.readdirSync(builtinThemesDir)
            .filter(f => f.endsWith('.css'))
            .map(f => ({ name: f.replace('.css', ''), path: `/themes/${f}`, builtin: true }));

          const userThemes = loadUserThemes();

          const allThemes = [
            { name: 'default', path: null, builtin: true },
            ...builtinThemes,
            ...userThemes,
          ];

          res.render('admin/settings/settings', { user, req, settings, allThemes });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/settings/example-theme',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const zipDir = path.join(process.cwd(), 'public', 'uploads', 'theme-zips');
          fs.mkdirSync(zipDir, { recursive: true });
          const archivePath = path.join(zipDir, 'example-theme-' + Date.now() + '.zip');

          const info = {
            name: 'Example Theme',
            author: 'Your Name',
            updatedAt: new Date().toISOString().split('T')[0],
          };

          const lightCss = `/* Example light mode theme */\n:root {\n  --color-primary: #4f46e5;\n}\n\nbody {\n  /* Add your light mode overrides here */\n}\n`;
          const darkCss = `/* Example dark mode theme */\n:root {\n  --color-primary: #818cf8;\n}\n\nbody {\n  /* Add your dark mode overrides here */\n}\n`;

          const zip = new AdmZip();
          zip.addFile('info.json', Buffer.from(JSON.stringify(info, null, 2)));
          zip.addFile('light.css', Buffer.from(lightCss));
          zip.addFile('dark.css', Buffer.from(darkCss));
          zip.writeZip(archivePath);

          res.download(archivePath, 'example-theme.zip', () => {
            fs.rmSync(archivePath, { force: true });
          });
        } catch (error) {
          logger.error('Error generating example theme:', error);
          res.status(500).json({ error: 'Failed to generate example theme.' });
        }
      }
    );

    router.post(
      '/admin/settings',
      isAuthenticated(true),
      upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'favicon', maxCount: 1 },
        { name: 'themeFile', maxCount: 1 },
      ]),
      async (req, res) => {
        try {
          const rawData = req.body;
          const files = req.files as { [fieldname: string]: Express.Multer.File[] };

          if (files.themeFile && files.themeFile[0]) {
            const result = installThemeZip(files.themeFile[0].path);
            if (!result.success) {
              return res.status(400).json({ success: false, error: result.error });
            }
          }

          const settingsData: SettingsData = {
            title: typeof rawData.title === 'string' ? rawData.title : undefined,
            lightTheme: typeof rawData.lightTheme === 'string' ? rawData.lightTheme : undefined,
            darkTheme: typeof rawData.darkTheme === 'string' ? rawData.darkTheme : undefined,
            allowRegistration: rawData.allowRegistration === 'true' || rawData.allowRegistration === true,
            uploadLimit: rawData.uploadLimit ? parseInt(rawData.uploadLimit, 10) : undefined,
            virusTotalApiKey: typeof rawData.virusTotalApiKey === 'string'
              ? (rawData.virusTotalApiKey.trim() || null)
              : undefined,
          };

          if (files.logo && files.logo[0]) {
            settingsData.logo = `/uploads/logos/${files.logo[0].filename}`;
          }

          if (files.favicon && files.favicon[0]) {
            settingsData.favicon = `/uploads/favicons/${files.favicon[0].filename}`;
            const sourcePath = files.favicon[0].path;
            const destPath = path.join(process.cwd(), 'public', 'favicon.ico');
            fs.copyFileSync(sourcePath, destPath);
          }

          const cleanData = Object.fromEntries(
            Object.entries(settingsData).filter(([, value]) => value !== undefined)
          );

          if (Object.keys(cleanData).length > 0) {
            await prisma.settings.update({
              where: { id: 1 },
              data: cleanData,
            });
          }

          res.json({ success: true });
        } catch (error) {
          logger.error('Error updating settings:', error);
          res.status(500).json({ success: false, error: 'Failed to update settings' });
        }
      }
    );

    router.post(
      '/admin/settings/reset',
      isAuthenticated(true),
      async (req, res) => {
        try {
          await prisma.settings.update({
            where: { id: 1 },
            data: {
              title: 'Airlink',
              logo: '../assets/logo.png',
              favicon: '../assets/favicon.ico',
              lightTheme: 'default',
              darkTheme: 'default',
              language: 'en',
              allowRegistration: false,
            },
          });

          const defaultFaviconPath = path.join(process.cwd(), 'public', 'assets', 'favicon.ico');
          const destPath = path.join(process.cwd(), 'public', 'favicon.ico');

          if (fs.existsSync(defaultFaviconPath)) {
            fs.copyFileSync(defaultFaviconPath, destPath);
          }

          res.json({ success: true });
        } catch (error) {
          logger.error('Error resetting settings:', error);
          res.status(500).json({ success: false, error: 'Failed to reset settings' });
        }
      },
    );

    router.post(
      '/admin/settings/security',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const rateLimitEnabled = req.body.rateLimitEnabled === 'true' || req.body.rateLimitEnabled === true;
          const rateLimitRpm = parseInt(req.body.rateLimitRpm, 10);

          if (isNaN(rateLimitRpm) || rateLimitRpm < 1 || rateLimitRpm > 10000) {
            return res.status(400).json({ success: false, error: 'RPM must be between 1 and 10000.' });
          }

          await prisma.settings.update({
            where: { id: 1 },
            data: { rateLimitEnabled, rateLimitRpm },
          });

          res.json({ success: true });
        } catch (error) {
          logger.error('Error updating security settings:', error);
          res.status(500).json({ success: false, error: 'Failed to update security settings.' });
        }
      },
    );

    router.post(
      '/admin/settings/ban-ip',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { ip } = req.body;
          if (!ip || typeof ip !== 'string' || !/^[\d.:a-fA-F]+$/.test(ip)) {
            return res.status(400).json({ success: false, error: 'Invalid IP address.' });
          }

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          if (!settings) return res.status(500).json({ success: false, error: 'Settings not found.' });

          let banned: string[] = [];
          try { banned = JSON.parse(settings.bannedIps); } catch { banned = []; }

          if (!banned.includes(ip)) {
            banned.push(ip);
            await prisma.settings.update({ where: { id: 1 }, data: { bannedIps: JSON.stringify(banned) } });
          }

          res.json({ success: true, banned });
        } catch (error) {
          logger.error('Error banning IP:', error);
          res.status(500).json({ success: false, error: 'Failed to ban IP.' });
        }
      },
    );

    router.post(
      '/admin/settings/unban-ip',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { ip } = req.body;
          if (!ip || typeof ip !== 'string') {
            return res.status(400).json({ success: false, error: 'IP is required.' });
          }

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          if (!settings) return res.status(500).json({ success: false, error: 'Settings not found.' });

          let banned: string[] = [];
          try { banned = JSON.parse(settings.bannedIps); } catch { banned = []; }

          banned = banned.filter(b => b !== ip);
          await prisma.settings.update({ where: { id: 1 }, data: { bannedIps: JSON.stringify(banned) } });

          res.json({ success: true, banned });
        } catch (error) {
          logger.error('Error unbanning IP:', error);
          res.status(500).json({ success: false, error: 'Failed to unban IP.' });
        }
      },
    );

    return router;
  },
};


export default adminModule;
