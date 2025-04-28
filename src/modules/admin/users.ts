import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { onlineUsers } from '../user/wsUsers';
import logger from '../../handlers/logger';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function listUsers(res: Response) {
  try {
    const users = await prisma.users.findMany({
      include: {
        servers: true
      }
    });

    return users;
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users.' });
  }
}

const adminModule: Module = {
  info: {
    name: 'Admin Users Module',
    description: 'This file is for admin functionality of the Users.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/users',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const users = await listUsers(res);
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/users/users', {
            user,
            req,
            settings,
            users,
            onlineUsers,
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/users/create',
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

          res.render('admin/users/create', { user, req, settings });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/users/create-user',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { email, username, password, isAdmin } = req.body;

        if (!email || !username || !password) {
          res.status(400).json({
            message: 'Missing required fields: email, username, or password.',
          });
          return;
        }

        // Convert isAdmin to boolean if it's not already
        const isAdminBool = typeof isAdmin === 'boolean' ? isAdmin : isAdmin === 'true';

        // Log the admin status for debugging
        logger.info(`Creating user with admin status: ${isAdminBool}, original value: ${isAdmin}, type: ${typeof isAdmin}`);

        try {
          const existingUser = await prisma.users.findFirst({
            where: {
              OR: [{ email }, { username }],
            },
          });

          if (existingUser) {
            res
              .status(400)
              .json({ message: 'Email or username already exists.' });
            return;
          }

          if (!existingUser) {
            await prisma.users.create({
              data: {
                email,
                username,
                password: await bcrypt.hash(password, 10),
                isAdmin: isAdminBool,
              },
            });
          }

          res.status(200).json({ message: 'User created successfully.' });
          return;
        } catch (error) {
          logger.error('Error creating user:', error);
          res
            .status(500)
            .json({ message: 'Error creating user. Please try again later.' });
          return;
        }
      },
    );

    router.get(
      '/admin/users/view/:id/',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const dataUser = await prisma.users.findUnique({
            where: { id: parseInt(req.params.id, 10) },
            include: {
              servers: true
            }
          });
          if (!dataUser) {
            return res.redirect('/admin/users');
          }
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/users/user', { user, req, settings, dataUser });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/users/edit/:id/',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const dataUser = await prisma.users.findUnique({
            where: { id: parseInt(req.params.id, 10) },
            include: {
              servers: true
            }
          });
          if (!dataUser) {
            return res.redirect('/admin/users');
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/users/edit', { user, req, settings, dataUser });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.delete(
      '/admin/users/delete/:id/',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const dataUser = await prisma.users.findUnique({
            where: { id: parseInt(req.params.id, 10) },
          });
          if (!dataUser) {
            return res.redirect('/admin/users');
          }

          await prisma.users.delete({
            where: { id: parseInt(req.params.id, 10) },
          });

          res.status(200).json({ message: 'User deleted successfully.' });
        } catch (error) {
          logger.error('Error deleting user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/users/update/:id/',
      isAuthenticated(true),
      async (req: Request, res: Response): Promise<void> => {
        try {
          const userId = req.session?.user?.id;
          const adminUser = await prisma.users.findUnique({ where: { id: userId } });
          if (!adminUser) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          const targetUserId = parseInt(req.params.id, 10);
          const targetUser = await prisma.users.findUnique({
            where: { id: targetUserId },
          });

          if (!targetUser) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const { email, username, description, isAdmin, password } = req.body;

          // Check if email or username is already taken by another user
          if (email && email !== targetUser.email) {
            const existingUserWithEmail = await prisma.users.findFirst({
              where: {
                email,
                id: { not: targetUserId }
              },
            });

            if (existingUserWithEmail) {
              res.status(400).json({ error: 'Email already in use' });
              return;
            }
          }

          if (username && username !== targetUser.username) {
            const existingUserWithUsername = await prisma.users.findFirst({
              where: {
                username,
                id: { not: targetUserId }
              },
            });

            if (existingUserWithUsername) {
              res.status(400).json({ error: 'Username already in use' });
              return;
            }
          }

          // Prepare update data
          const updateData: any = {};

          if (email) updateData.email = email;
          if (username) updateData.username = username;
          if (description) updateData.description = description;

          // Handle isAdmin field (convert to boolean)
          if (isAdmin !== undefined) {
            updateData.isAdmin = isAdmin === true || isAdmin === 'true';
          }

          // Handle password update if provided
          if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
          }

          // Update user
          await prisma.users.update({
            where: { id: targetUserId },
            data: updateData,
          });

          res.status(200).json({ message: 'User updated successfully' });
        } catch (error) {
          logger.error('Error updating user:', error);
          res.status(500).json({ error: 'Internal server error' });
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
