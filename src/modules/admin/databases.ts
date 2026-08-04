import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { registerPermission } from '../../handlers/permissions';
import { getParamAsNumber } from '../../utils/typeHelpers';
import { testDatabaseHost } from '../../handlers/utils/core/mysqlProvisioner';
import { ensureS3Bucket } from '../../handlers/utils/core/s3Client';

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
            include: {
              _count: { select: { databases: true } },
              node: { select: { id: true, name: true } },
            },
            orderBy: { id: 'asc' },
          });
          const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          res.render('admin/databases/databases', { hosts, user, settings, req });
        } catch (error: unknown) {
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
        const nodes = await prisma.node.findMany({ orderBy: { name: 'asc' } });
        res.render('admin/databases/create', { user, settings, nodes, req });
      },
    );

    router.post(
      '/admin/databases/create',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req: Request, res: Response) => {
        try {
          const { name, host, port, username, password, nodeId } = req.body;
          if (!name || !host || !username || !password) {
            return res.redirect('/admin/databases/create?err=missing_fields');
          }
          const portNum = getParamAsNumber(port) || 3306;
          const parsedNode = getParamAsNumber(nodeId);
          await prisma.databaseHost.create({
            data: {
              name: String(name).trim(),
              host: String(host).trim(),
              port: portNum,
              username: String(username).trim(),
              password: String(password),
              nodeId: parsedNode && parsedNode > 0 ? parsedNode : null,
            },
          });
          res.redirect('/admin/databases?err=none');
        } catch (error: unknown) {
          logger.error('Error creating database host:', error);
          res.redirect('/admin/databases/create?err=create_failed');
        }
      },
    );

    router.post(
      '/admin/databases/auto-host',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req: Request, res: Response) => {
        try {
          const hosts = await prisma.databaseHost.findMany({ orderBy: { id: 'asc' } });
          let host = hosts[0];
          let created = false;
          if (!host) {
            host = await prisma.databaseHost.create({
              data: {
                name: 'Auto-generated host',
                host: process.env.MYSQL_HOST || '127.0.0.1',
                port: Number(process.env.MYSQL_PORT) || 3306,
                username: process.env.MYSQL_USER || 'root',
                password: process.env.MYSQL_PASSWORD || '',
              },
            });
            created = true;
          }
          const result = await testDatabaseHost(host);
          return res.json({ success: result.success, created, hostId: host.id, latency: result.latency, error: result.error });
        } catch (error: unknown) {
          logger.error('Error auto-generating database host:', error);
          return res.status(500).json({ success: false, error: 'Failed to auto-generate database host.' });
        }
      },
    );

    router.post(
      '/admin/databases/auto-bucket',
      isAuthenticated(true, 'airlink.admin.databases.create'),
      async (req: Request, res: Response) => {
        try {
          const { created } = await ensureS3Bucket();
          return res.json({ success: true, created });
        } catch (error: unknown) {
          logger.error('Error auto-generating S3 bucket:', error);
          const message = error instanceof Error ? error.message : 'Failed to auto-generate S3 bucket.';
          const unconfigured = message.includes('S3 not configured');
          return res.status(unconfigured ? 400 : 500).json({
            success: false,
            error: unconfigured ? 'S3 is not configured. Add your S3-compatible endpoint and credentials in Admin Settings first.' : message,
          });
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
        } catch (error: unknown) {
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
        } catch (error: unknown) {
          logger.error('Error deleting database host:', error);
          return res.status(500).json({ success: false, error: 'Failed to delete database host.' });
        }
      },
    );

    return router;
  },
};

export default databasesModule;
