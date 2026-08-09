import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';
import bcrypt from 'bcryptjs';
import logger from '../../handlers/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import validator from 'validator';
import { inspectImage, isSafeUserDirName, normalizeUserText } from '../../utils/imageSecurity';
import type { ErrorMessage } from './server/shared';

const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const DESCRIPTION_MAX_LENGTH = 255;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const BCRYPT_SALT_ROUNDS = 10;
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'zh', 'ja', 'ta'] as const;

// Avatars are buffered in memory so the server can verify the real content
// before anything touches disk. The stored filename and extension come from
// the detected magic bytes (src/utils/imageSecurity.ts), never from the
// client-declared mimetype or original filename.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_SIZE_BYTES, files: 1 },
});

const AVATARS_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars');

function avatarUserDir(username: string): string | null {
  if (!isSafeUserDirName(username)) {return null;}
  return path.join(AVATARS_DIR, username);
}


const accountModule: Module = {
  info: {
    name: 'Account Module',
    description: 'This file is for account functionality.',
    version: '2.0.0',
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
          const [user, loginHistory, nodes] = await Promise.all([
            prisma.users.findUnique({ where: { id: userId } }),
            prisma.loginHistory.findMany({
              where: { userId },
              orderBy: { timestamp: 'desc' },
              take: 10,
            }),
            prisma.node.findMany({
              select: { id: true, name: true, address: true },
              orderBy: { id: 'asc' },
            }),
          ]);
          if (!user) {
            errorMessage.message = 'User not found.';
            res.render('user/account', { errorMessage, user, req, allowed: false });
            return;
          }

          const allowed = user.isAdmin === true || settings?.allowUserCreateImages === true;

          res.render('user/account', {
            errorMessage,
            user,
            req,
            settings,
            loginHistory,
            nodes,
            allowed,
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
            nodes: [],
            allowed: false,
          });
        }
      },
    );

    router.post(
      '/update-description',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const { description } = req.body;
        if (description === undefined || description === null) {
          res.status(400).send('Description parameter is required.');
          return;
        }

        // Normalize (strip control chars/NUL, trim, cap length) and store the
        // cleaned value — the raw body was being persisted before.
        const cleanDesc = normalizeUserText(description, DESCRIPTION_MAX_LENGTH);
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
            data: { description: cleanDesc },
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
            !validator.isLength(cleanUsername, { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })) {
          res.status(400).send(`Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters and contain only letters, numbers, underscores, or hyphens.`);
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

          const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

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
            where: { email },
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
      '/set-preferred-node',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const { preferredNodeId } = req.body;

        if (preferredNodeId === undefined || preferredNodeId === null || preferredNodeId === '') {
          res.status(400).json({ message: 'A preferred node is required.' });
          return;
        }

        const nodeId = parseInt(String(preferredNodeId), 10);
        if (Number.isNaN(nodeId) || nodeId < 1) {
          res.status(400).json({ message: 'Invalid node.' });
          return;
        }

        try {
          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(400).json({ message: 'Node not found.' });
            return;
          }

          await prisma.users.update({
            where: { id: userId },
            data: { preferredNodeId: node.id },
          });

          res.status(200).json({ message: 'Preferred node saved.', preferredNodeId: node.id });
        } catch (error) {
          logger.error('Error saving preferred node:', error);
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
        if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) {
          res.status(400).send('Unsupported language.');
          return;
        }

        try {
          // Set the language cookie
          res.cookie('lang', language, {
            maxAge: COOKIE_MAX_AGE_MS,
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

        const userId = req.session?.user?.id;
        const username = req.session?.user?.username;
        if (!userId || !username) {
          res.status(401).json({ message: 'Not authenticated.' });
          return;
        }

        // Real content validation: magic bytes + polyglot rejection. The
        // client-declared mimetype/originalname are never trusted.
        const inspection = inspectImage(req.file.buffer);
        if (!inspection.ok) {
          res.status(400).json({ message: inspection.reason ?? 'Invalid image file.' });
          return;
        }

        // username is validated at registration, but the session value still
        // drives the on-disk directory — guard it anyway.
        const userDir = avatarUserDir(username);
        if (!userDir) {
          res.status(400).json({ message: 'Invalid user directory.' });
          return;
        }

        try {
          if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
          } else {
            const existing = fs.readdirSync(userDir);
            existing.forEach(f => {
              try { fs.unlinkSync(path.join(userDir, f)); } catch { /* ignore per-file errors */ }
            });
          }

          const filename = `avatar${inspection.ext}`;
          fs.writeFileSync(path.join(userDir, filename), req.file.buffer);
          const avatarPath = `/uploads/avatars/${username}/${filename}`;

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
          const username = req.session?.user?.username;

          if (!username) {
            res.status(400).json({ message: 'User not authenticated.' });
            return;
          }

          const userDir = avatarUserDir(username);
          if (!userDir) {
            res.status(400).json({ message: 'Invalid user directory.' });
            return;
          }
          if (fs.existsSync(userDir)) {
            fs.readdirSync(userDir).forEach(f => {
              try { fs.unlinkSync(path.join(userDir, f)); } catch { /* ignore per-file errors */ }
            });
            try { fs.rmdirSync(userDir); } catch { /* ignore if dir still has files */ }
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


    router.get(
      '/credits',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const [user, settings] = await Promise.all([
            prisma.users.findUnique({ where: { id: userId } }),
            prisma.settings.findUnique({ where: { id: 1 } }),
          ]);
          if (!user) {return res.redirect('/login');}
          const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
          res.render('user/credits', { user, req, settings, version: pkg.version });
        } catch (error) {
          logger.error('Error loading credits page:', error);
          res.redirect('/');
        }
      },
    );

    return router;
  },
};


export default accountModule;
