import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';
import bcrypt from 'bcrypt';
import logger from '../../handlers/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import validator from 'validator';

const avatarStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const username = (req as any).session?.user?.username;
    if (!username) return cb(new Error('Not authenticated'), '');

    const userDir = path.join(process.cwd(), 'public', 'uploads', 'avatars', username);

    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    } else {
      const existing = fs.readdirSync(userDir);
      existing.forEach(f => {
        try { fs.unlinkSync(path.join(userDir, f)); } catch (_) {}
      });
    }

    cb(null, userDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `avatar${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 },
});


interface ErrorMessage {
  message?: string;
}

const accountModule: Module = {
  info: {
    name: 'Account Module',
    description: 'This file is for account functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/account',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        try {
          const [user, loginHistory] = await Promise.all([
            prisma.users.findUnique({ where: { id: userId } }),
            prisma.loginHistory.findMany({
              where: { userId },
              orderBy: { timestamp: 'desc' },
              take: 10,
            }),
          ]);
          if (!user) {
            errorMessage.message = 'User not found.';
            res.render('user/account', { errorMessage, user, req });
            return;
          }

          res.render('user/account', {
            errorMessage,
            user,
            req,
            settings,
            loginHistory,
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          errorMessage.message = 'Error fetching user data.';
          res.render('user/account', {
            errorMessage,
            user: getUser(req),
            req,
            settings,
            loginHistory: [],
          });
        }
      },
    );

    router.post(
      '/update-description',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { description } = req.body;
        if (!description) {
          res.status(400).send('Description parameter is required.');
          return;
        }

        const cleanDesc = validator.trim(String(description).slice(0, 255));
        if (cleanDesc.length === 0) {
          res.status(400).send('Description cannot be empty.');
          return;
        }

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findFirst({
            where: { id: userId },
          });

          if (!user) {
            res.redirect('/login');
            return;
          }

          await prisma.users.update({
            where: { id: userId },
            data: { description },
          });

          res.status(200).json({ message: 'Description updated successfully.' });
          return;
        } catch (error) {
          logger.error('Error updating description:', error);
          res.status(500).send('Internal Server Error');
        }
      },
    );

    router.post(
      '/update-username',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { newUsername } = req.body;
        const userId = req.session?.user?.id;

        if (!newUsername) {
          res.status(400).send('New username parameters are required.');
          return;
        }

        const cleanUsername = validator.trim(String(newUsername));
        if (!validator.isAlphanumeric(cleanUsername, 'en-US', { ignore: '_-' }) ||
            !validator.isLength(cleanUsername, { min: 3, max: 32 })) {
          res.status(400).send('Username must be 3–32 characters and contain only letters, numbers, underscores, or hyphens.');
          return;
        }

        try {
          const userExist = await prisma.users.findFirst({
            where: { id: userId },
          });

          if (!userExist) {
            res.status(404).send('Current username does not exist.');
            return;
          }

          const newUsernameExist = await prisma.users.findFirst({
            where: { username: newUsername },
          });

          if (newUsernameExist) {
            res.status(409).send('New username is already taken.');
            return;
          }

          await prisma.users.updateMany({
            data: { username: newUsername },
            where: { username: userExist.username },
          });

          res.status(200).json({ message: 'Username updated successfully.' });
        } catch (error) {
          logger.error('Error updating username:', error);
          res.status(500).send('Internal Server Error');
        }
      },
    );

    router.get(
      '/check-username',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { username } = req.query;

        if (!username) {
          res.status(400).json({ message: 'Username is required.' });
          return;
        }

        try {
          const user = await prisma.users.findFirst({
            where: { username: username as string },
          });
          if (user) {
            res.status(200).json({ exists: true });
            return;
          }

          res.status(200).json({ exists: false });
          return;
        } catch (error) {
          logger.error('Error checking username:', error);
          res.status(500).json({ message: 'Error checking username.' });
          return;
        }
      },
    );

    router.post(
      '/change-password',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
          res
            .status(400)
            .send('Current and new password parameters are required.');
          return;
        }

        try {
          const userId = req.session?.user?.id;

          const currentUser = await prisma.users.findUnique({
            where: { id: userId },
          });
          if (!currentUser) {
            res.status(404).send('User not found.');
            return;
          }

          const passwordMatch = await bcrypt.compare(
            currentPassword,
            currentUser.password,
          );
          if (!passwordMatch) {
            res.status(401).send('Current password is incorrect.');
            return;
          }

          const hashedNewPassword = await bcrypt.hash(newPassword, 10);

          await prisma.users.update({
            where: { id: userId },
            data: { password: hashedNewPassword },
          });

          res.status(200).json({ message: 'Password changed successfully.' });
        } catch (error) {
          logger.error('Error changing password:', error);
          res.status(500).send('Internal Server Error');
        }
      },
    );

    router.post(
      '/validate-password',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const { currentPassword } = req.body;

          if (!currentPassword) {
            res.status(400).json({ message: 'Current password is required.' });
            return;
          }

          const userId = req.session?.user?.id;

          const currentUser = await prisma.users.findUnique({
            where: { id: userId },
          });

          if (currentUser && currentUser.password) {
            const isPasswordValid = await bcrypt.compare(
              String(currentPassword),
              currentUser.password,
            );

            if (isPasswordValid) {
              res.status(200).json({ valid: true });
            } else {
              res.status(200).json({ valid: false });
            }
          } else {
            res
              .status(404)
              .json({ message: 'User not found or password not available.' });
          }
        } catch (error) {
          logger.error('Error validating password:', error);
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    router.post(
      '/change-email',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { email } = req.body;

        if (!email) {
          res.status(400).json({ message: 'Email is required.' });
          return;
        }

        const cleanEmail = validator.trim(String(email)).toLowerCase();
        if (!validator.isEmail(cleanEmail)) {
          res.status(400).json({ message: 'Invalid email address.' });
          return;
        }

        const userId = req.session?.user?.id;

        try {
          const user = await prisma.users.findFirst({
            where: { email: email },
          });

          if (user) {
            res.status(409).send('Email is already in use.');
            return;
          }

          await prisma.users.update({
            where: { id: userId },
            data: { email },
          });

          res.status(200).json({ message: 'Email updated successfully.' });
        } catch (error) {
          logger.error('Error updating email:', error);
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    router.post(
      '/set-language',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { language } = req.body;

        if (!language) {
          res.status(400).send('Language parameter is required.');
          return;
        }

        // Validate language is supported
        const supportedLanguages = ['en', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'zh', 'ja', 'ta'];
        if (!supportedLanguages.includes(language)) {
          res.status(400).send('Unsupported language.');
          return;
        }

        try {
          // Set the language cookie
          res.cookie('lang', language, {
            maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
            httpOnly: true,
            sameSite: 'strict'
          });

          res.status(200).json({ message: 'Language preference saved.' });
        } catch (error) {
          logger.error('Error setting language preference:', error);
          res.status(500).send('Internal Server Error');
        }
      },
    );

    router.post(
      '/upload-avatar',
      isAuthenticated(),
      avatarUpload.single('avatar'),
      async (req: Request, res: Response) => {
        if (!req.file) {
          res.status(400).json({ message: 'No file uploaded.' });
          return;
        }

        try {
          const userId = req.session?.user?.id;
          const username = (req as any).session?.user?.username;
          const avatarPath = `/uploads/avatars/${username}/${req.file.filename}`;

          await prisma.users.update({
            where: { id: userId },
            data: { avatar: avatarPath },
          });

          res.status(200).json({ message: 'Avatar updated.', avatar: avatarPath });
        } catch (error) {
          logger.error('Error uploading avatar:', error);
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    router.post(
      '/remove-avatar',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const username = (req as any).session?.user?.username;

          const userDir = path.join(process.cwd(), 'public', 'uploads', 'avatars', username);
          if (fs.existsSync(userDir)) {
            fs.readdirSync(userDir).forEach(f => {
              try { fs.unlinkSync(path.join(userDir, f)); } catch (_) {}
            });
            try { fs.rmdirSync(userDir); } catch (_) {}
          }

          await prisma.users.update({
            where: { id: userId },
            data: { avatar: null },
          });

          res.status(200).json({ message: 'Avatar removed.' });
        } catch (error) {
          logger.error('Error removing avatar:', error);
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    return router;
  },
};


export default accountModule;
