import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { registerPermission } from '../../handlers/permissions';
import { getParamAsNumber } from '../../utils/typeHelpers';
import { testDatabaseHost } from '../../handlers/utils/core/mysqlProvisioner';

registerPermission('airlink.admin.databases.view');
registerPermission('airlink.admin.databases.create');
registerPermission('airlink.admin.databases.delete');
registerPermission('airlink.admin.databases.test');

const databasesModule: Module = {
  info: {
    name: 'Database Hosts Module',
    description: 'Manages MySQL database hosts and host creation.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/databases',
      isAuthenticated(true, 'airlink.admin.databases.view'),
      async (req: Request, res: Response) => {
        try {
          const hosts = await prisma.databaseHost.findMany({
            include: { _count: { select: { databases: true } } },
            orderBy: { id: 'asc' },
          });
          const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          res.render('admin/databases/databases', { hosts, user, settings, req });
        } catch (error) {
          logger.error('Error rendering database hosts page:', error);
          res.redirect('/admin/overview');
        }
      },
    );

    router.get(
      '/admin/databases/create',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req: Request, res: Response) => {
        const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        res.render('admin/databases/create', { user, settings, req });
      },
    );

    router.post(
      '/admin/databases/create',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req: Request, res: Response) => {
        try {
          const { name, host, port, username, password } = req.body;
          if (!name || !host || !username || !password) {
            return res.redirect('/admin/databases/create?err=missing_fields');
          }
          const portNum = getParamAsNumber(port) || 3306;
          await prisma.databaseHost.create({
            data: {
              name: String(name).trim(),
              host: String(host).trim(),
              port: portNum,
              username: String(username).trim(),
              password: String(password),
            },
          });
          res.redirect('/admin/databases?err=none');
        } catch (error) {
          logger.error('Error creating database host:', error);
          res.redirect('/admin/databases/create?err=create_failed');
        }
      },
    );

    router.post(
      '/admin/databases/:id/test',
      isAuthenticated(true, 'airlink.admin.databases.test'),
      async (req: Request, res: Response) => {
        try {
          const id = getParamAsNumber(req.params.id);
          const host = await prisma.databaseHost.findUnique({ where: { id } });
          if (!host) {
            return res.status(404).json({ success: false, error: 'Database host not found.' });
          }
          const result = await testDatabaseHost(host);
          return res.json(result);
        } catch (error) {
          logger.error('Error testing database host:', error);
          return res.status(500).json({ success: false, error: 'Failed to test database host.' });
        }
      },
    );

    router.delete(
      '/admin/databases/:id',
      isAuthenticated(true, 'airlink.admin.databases.delete'),
      async (req: Request, res: Response) => {
        try {
          const id = getParamAsNumber(req.params.id);
          const count = await prisma.serverDatabase.count({ where: { hostId: id } });
          if (count > 0) {
            return res.status(400).json({ success: false, error: 'Cannot delete host with active databases.' });
          }
          await prisma.databaseHost.delete({ where: { id } });
          return res.json({ success: true });
        } catch (error) {
          logger.error('Error deleting database host:', error);
          return res.status(500).json({ success: false, error: 'Failed to delete database host.' });
        }
      },
    );

    return router;
  },
};

export default databasesModule;
