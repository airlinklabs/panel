import { Router, Request, Response, NextFunction } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';
import bcrypt from 'bcrypt';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

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
        // todo : remove this fucking shit use like flash or somethings like that but not that bro, idk why we do that
        const errorMessage: ErrorMessage = {};
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            res.render('user/account', { errorMessage, user, req });
            return;
          }

          res.render('user/account', {
            errorMessage,
            user,
            req,
            
            logo: '',
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          errorMessage.message = 'Error fetching user data.';
          res.render('user/account', {
            errorMessage,
            user: getUser(req),
            req,
            name: 'AirLink',
            logo: '',
          });
        }
      },
    );

    router.post(
      '/update-description',
      isAuthenticated(),
      async (req: Request, res: Response, next: NextFunction) => {
        const { description } = req.body;
        if (!description) {
          res.status(400).send('Description parameter is required.');
          return;
        }

        if (description.length > 255) {
          res.status(400).send('Description must be less than 255 characters.');
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

          res.status(200).redirect('/account');
          return;
        } catch (error) {
          logger.error('Error updating description:', error);
          res.status(500).send('Internal Server Error');
        }
      }
    );

    router.post(
      '/update-username',
      isAuthenticated(),
      async (req: Request, res: Response, next: NextFunction) => {
        const { currentUsername, newUsername } = req.body;

        if (!currentUsername || !newUsername) {
          res
            .status(400)
            .send('Current and new username parameters are required.');
          return;
        }

        try {
          const userExist = await prisma.users.findFirst({
            where: { username: currentUsername },
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
            where: { username: currentUsername },
          });

          req.session.destroy((err) => {
            if (err) next(err);
            res.status(200).json({ success: true, username: newUsername });
          });
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
      async (req: Request, res: Response, next: NextFunction) => {
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

          req.session.destroy((err) => {
            if (err) next(err);
          });

          res.status(200).redirect('/login?err=UpdatedCredentials');
        } catch (error) {
          logger.error('Error changing password:', error);
          res.status(500).send('Internal Server Error');
        }
      },
    );

    router.get(
      '/validate-password',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const { currentPassword } = req.query;

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

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default accountModule;
