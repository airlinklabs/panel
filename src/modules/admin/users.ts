import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { onlineUsers } from '../user/wsUsers';
import logger from '../../handlers/logger';
import bcrypt from 'bcryptjs';
import { getParamAsNumber } from '../../utils/typeHelpers';
import { logActivity } from '../../handlers/utils/activity/activityLogger';
import { registerPermission, type Permission } from '../../handlers/permissions';
import { isRoleInput as isRole, type UserRole, roleFields } from '../../handlers/utils/auth/roles';

const USERNAME_REGEX = /^[a-zA-Z0-9]{3,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_SALT_ROUNDS = 12;

registerPermission('airlink.admin.users.view' as Permission);
registerPermission('airlink.admin.users.create' as Permission);
registerPermission('airlink.admin.users.edit' as Permission);
registerPermission('airlink.admin.users.delete' as Permission);

function isRoleValue(value: unknown): boolean {
  return isRole(value);
}

function requestedOrNull(value: unknown): number | null {
  return value === '' || value === null || value === undefined ? null : parseInt(String(value), 10);
}

async function countAdmins(): Promise<number> {
  return prisma.users.count({ where: { isAdmin: true } });
}


async function listUsers(res: Response) {
  try {
    const users = await prisma.users.findMany({
      include: {
        servers: true
      }
    });

    return users;
  } catch (error: unknown) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users.' });
    return;
  }
}

const adminModule: Module = {
  info: {
    name: 'Admin Users Module',
    description: 'This file is for admin functionality of the Users.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/users',
      isAuthenticated(true, 'airlink.admin.users.view'),
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
        } catch (error: unknown) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/users/create',
      isAuthenticated(true, 'airlink.admin.users.view'),
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
        } catch (error: unknown) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/users/create-user',
      isAuthenticated(true, 'airlink.admin.users.create'),
      async (req: Request, res: Response) => {
        const { email, username, password, isAdmin, role, serverLimit, maxMemory, maxCpu, maxStorage, maxDatabases } = req.body;

        if (!email || !username || !password) {
          res.status(400).json({
            message: 'Missing required fields: email, username, or password.',
          });
          return;
        }

        if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
          res.status(400).json({ message: 'Please provide a valid email address.' });
          return;
        }

        if (!USERNAME_REGEX.test(username)) {
          res.status(400).json({
            message: 'Username must be 3–20 characters and contain only letters and numbers.',
          });
          return;
        }

        if (password.length < PASSWORD_MIN_LENGTH || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
          res.status(400).json({
            message: 'Password must be at least 8 characters and contain at least one letter and one number.',
          });
          return;
        }

        const isAdminBool = typeof isAdmin === 'boolean' ? isAdmin : isAdmin === 'true';
        // Explicit role wins; otherwise derive from the legacy isAdmin flag.
        const requestedRole: UserRole = isRoleValue(role) ? role : isAdminBool ? 'admin' : 'user';
        const roleData = roleFields(requestedRole);

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

          await prisma.users.create({
            data: {
              email,
              username,
              password: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
              role: roleData.role,
              isAdmin: roleData.isAdmin,
              serverLimit: requestedOrNull(serverLimit),
              maxMemory: requestedOrNull(maxMemory),
              maxCpu: requestedOrNull(maxCpu),
              maxStorage: requestedOrNull(maxStorage),
              maxDatabases: requestedOrNull(maxDatabases),
            },
          });

          await logActivity(req, 'user:create', { metadata: { username, email } });

          res.status(200).json({ message: 'User created successfully.' });
          return;
        } catch (error: unknown) {
          logger.error('Error creating user:', error);
          res
            .status(500)
            .json({ message: 'Error creating user. Please try again later.' });
          return;
        }
      },
    );

router.get(
      '/admin/users/edit/:id/',
      isAuthenticated(true, 'airlink.admin.users.edit'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const dataUser = await prisma.users.findUnique({
            where: { id: getParamAsNumber(req.params.id) },
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

          res.render('admin/users/edit', {
            user,
            req,
            settings,
            dataUser,
            canTransferOwner: user.role === 'owner' && dataUser.role !== 'owner',
          });
        } catch (error: unknown) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

router.get(
      '/admin/users/view/:id/',
      isAuthenticated(true, 'airlink.admin.users.view'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const dataUser = await prisma.users.findUnique({
            where: { id: getParamAsNumber(req.params.id) },
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

          res.render('admin/users/user', {
            user,
            req,
            settings,
            dataUser,
          });
        } catch (error: unknown) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.delete(
      '/admin/users/delete/:id/',
      isAuthenticated(true, 'airlink.admin.users.delete'),
      async (req: Request, res: Response): Promise<void> => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          const targetId = getParamAsNumber(req.params.id);
          const dataUser = await prisma.users.findUnique({
            where: { id: targetId },
          });
          if (!dataUser) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          if (userId === targetId) {
            res.status(400).json({ error: 'Cannot delete your own account' });
            return;
          }

          if (dataUser.role === 'owner') {
            res.status(403).json({ error: 'The owner cannot be deleted. Transfer ownership first.' });
            return;
          }

          if (dataUser.isAdmin && (await countAdmins()) <= 1) {
            res.status(400).json({ error: 'Cannot delete the last admin account' });
            return;
          }

          const serverCount = await prisma.server.count({ where: { ownerId: targetId } });
          if (serverCount > 0) {
            res.status(409).json({
              error: 'Cannot delete user: they own servers. Delete or reassign those servers first.',
            });
            return;
          }

          await prisma.session.deleteMany({
            where: { data: { contains: `"id":${targetId}` } },
          });

          await prisma.loginHistory.deleteMany({ where: { userId: targetId } });

          await prisma.users.delete({
            where: { id: targetId },
          });

          res.status(200).json({ message: 'User deleted successfully.' });
        } catch (error: unknown) {
          logger.error('Error deleting user:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      },
    );

    router.post(
      '/admin/users/update/:id/',
      isAuthenticated(true, 'airlink.admin.users.edit'),
      async (req: Request, res: Response): Promise<void> => {
        try {
          const userId = req.session?.user?.id;
          const adminUser = await prisma.users.findUnique({ where: { id: userId } });
          if (!adminUser) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          const targetUserId = getParamAsNumber(req.params.id);
          const targetUser = await prisma.users.findUnique({
            where: { id: targetUserId },
          });

          if (!targetUser) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const { email, username, description, isAdmin, role, password, serverLimit, maxMemory, maxCpu, maxStorage, maxDatabases } = req.body;

          // Validate updated values before writing anything
          if (email && (typeof email !== 'string' || !EMAIL_REGEX.test(email))) {
            res.status(400).json({ error: 'Please provide a valid email address.' });
            return;
          }

          if (username && (typeof username !== 'string' || !USERNAME_REGEX.test(username))) {
            res.status(400).json({
              error: 'Username must be 3–20 characters and contain only letters and numbers.',
            });
            return;
          }

          if (
            password &&
            typeof password === 'string' &&
            password.trim() !== '' &&
            (password.length < PASSWORD_MIN_LENGTH || !/[A-Za-z]/.test(password) || !/\d/.test(password))
          ) {
            res.status(400).json({
              error: 'Password must be at least 8 characters and contain at least one letter and one number.',
            });
            return;
          }

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

          // Handle isAdmin field (convert to boolean)
          const newIsAdmin = isAdmin === true || isAdmin === 'true';
          if (isAdmin !== undefined && isAdmin !== null && targetUser.isAdmin && !newIsAdmin) {
            const isSelf = targetUserId === userId;
            const adminCount = await countAdmins();
            if (isSelf) {
              res.status(400).json({ error: 'You cannot remove your own admin role' });
              return;
            }
            if (adminCount <= 1) {
              res.status(400).json({ error: 'Cannot demote the last admin account' });
              return;
            }
          }

          // Prepare update data
          const updateData: Record<string, unknown> = {};

          if (email) updateData.email = email;
          if (username) updateData.username = username;
          if (description) updateData.description = description;

          // Role handling: the owner cannot be renamed, demoted, or
          // restricted by anyone — ownership only moves through the explicit
          // owner-transfer flow.
          if (targetUser.role === 'owner' && userId !== targetUserId) {
            res.status(403).json({ error: 'The owner cannot be edited by anyone but the owner.' });
            return;
          }

          // Handle isAdmin field (convert to boolean)
          if (isAdmin !== undefined) {
            updateData.isAdmin = isAdmin === true || isAdmin === 'true';
          }

          // Role field stays in sync with isAdmin when either is provided.
          const nextRole = role !== undefined ? (isRoleValue(role) ? role : undefined) : isAdmin !== undefined
            ? (isAdmin === true || isAdmin === 'true' ? 'admin' : 'user')
            : undefined;
          if (nextRole !== undefined) {
            // Admins must never be able to grant or strip the owner role.
            if (nextRole === 'owner') {
              res.status(403).json({ error: 'Only the owner-transfer flow can assign the owner role.' });
              return;
            }
            const { role: updatedRole, isAdmin: updatedIsAdmin } = roleFields(nextRole);
            updateData.role = updatedRole;
            updateData.isAdmin = updatedIsAdmin;
          }

          // Handle optional resource limits — null means "use global default"
          if (serverLimit !== undefined) {
            updateData.serverLimit = serverLimit === '' || serverLimit === null ? null : parseInt(serverLimit, 10);
          }
          if (maxMemory !== undefined) {
            updateData.maxMemory = maxMemory === '' || maxMemory === null ? null : parseInt(maxMemory, 10);
          }
          if (maxCpu !== undefined) {
            updateData.maxCpu = maxCpu === '' || maxCpu === null ? null : parseInt(maxCpu, 10);
          }
          if (maxStorage !== undefined) {
            updateData.maxStorage = maxStorage === '' || maxStorage === null ? null : parseInt(maxStorage, 10);
          }
          if (maxDatabases !== undefined) {
            updateData.maxDatabases = maxDatabases === '' || maxDatabases === null || maxDatabases === 'null' ? null : parseInt(maxDatabases, 10);
          }

          // Handle password update if provided
          if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
          }

          // Update user
          await prisma.users.update({
            where: { id: targetUserId },
            data: updateData,
          });

          await logActivity(req, 'user:update', { metadata: { targetUserId, username: targetUser.username } });

          res.status(200).json({ message: 'User updated successfully' });
        } catch (error: unknown) {
          logger.error('Error updating user:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      },
    );

    router.post(
      '/admin/users/transfer-owner/:id/',
      isAuthenticated(true, 'airlink.admin.users.edit'),
      async (req: Request, res: Response): Promise<void> => {
        try {
          const actorId = req.session?.user?.id;
          const actor = await prisma.users.findUnique({ where: { id: actorId } });
          if (!actor) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          // Only the current owner may hand over ownership. This guards the
          // owner role even from a session that has admin permissions.
          if (actor.role !== 'owner') {
            res.status(403).json({ error: 'Only the current owner can transfer ownership.' });
            return;
          }

          const targetUserId = getParamAsNumber(req.params.id);
          const targetUser = await prisma.users.findUnique({
            where: { id: targetUserId },
          });
          if (!targetUser) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          if (targetUser.role === 'owner') {
            res.status(400).json({ error: 'The target user is already the owner.' });
            return;
          }

          const ownerData = roleFields('owner');
          const adminData = roleFields('admin');

          await prisma.$transaction([
            prisma.users.update({
              where: { id: targetUserId },
              data: { role: ownerData.role, isAdmin: ownerData.isAdmin },
            }),
            prisma.users.update({
              where: { id: actorId },
              data: { role: adminData.role, isAdmin: adminData.isAdmin },
            }),
          ]);

          await logActivity(req, 'user:update', {
            metadata: { event: 'owner.transfer', targetUserId, username: targetUser.username },
          });

          res.status(200).json({ message: `Ownership transferred to ${targetUser.username}.` });
        } catch (error: unknown) {
          logger.error('Error transferring owner role:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
