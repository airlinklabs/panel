import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir;

    if (file.fieldname === 'logo') {
      uploadDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
    } else if (file.fieldname === 'favicon') {
      uploadDir = path.join(process.cwd(), 'public', 'uploads', 'favicons');
    } else {
      uploadDir = path.join(process.cwd(), 'public', 'uploads');
    }

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);

    if (file.fieldname === 'favicon') {
      cb(null, 'favicon' + ext);
    } else {
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
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
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

interface SettingsData {
  title?: string;
  logo?: string;
  favicon?: string;
  theme?: string;
  language?: string;
  allowRegistration?: boolean;
}

const adminModule: Module = {
  info: {
    name: 'Admin Nodes Module',
    description: 'This file is for admin functionality of the Nodes.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
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
          res.render('admin/settings/settings', { user, req, settings });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/settings',
      isAuthenticated(true),
      upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'favicon', maxCount: 1 }
      ]),
      async (req, res) => {
        try {
          const rawData = req.body;
          const files = req.files as { [fieldname: string]: Express.Multer.File[] };

          const settingsData: SettingsData = {
            title: typeof rawData.title === 'string' ? rawData.title : undefined,
            theme: typeof rawData.theme === 'string' ? rawData.theme : undefined,
            language: typeof rawData.language === 'string' ? rawData.language : undefined,
            allowRegistration: rawData.allowRegistration === 'true' || rawData.allowRegistration === true,
          };

          if (files.logo && files.logo[0]) {
            const logoPath = `/uploads/logos/${files.logo[0].filename}`;
            settingsData.logo = logoPath;
          }

          if (files.favicon && files.favicon[0]) {
            const faviconPath = `/uploads/favicons/${files.favicon[0].filename}`;
            settingsData.favicon = faviconPath;

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
              theme: 'default',
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

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
