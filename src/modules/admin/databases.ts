import { getSettings } from '../../handlers/settingsCache';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { registerPermission } from '../../handlers/permissions';
import { getParamAsNumber } from '../../utils/typeHelpers';
import { safeClientMessage } from '../../utils/errors';
import { testDatabaseHost } from '../../handlers/utils/core/mysqlProvisioner';
import { ensureS3Bucket } from '../../handlers/utils/core/s3Client';

registerPermission('airlink.admin.databases.view');
registerPermission('airlink.admin.databases.create');
registerPermission('airlink.admin.databases.delete');
registerPermission('airlink.admin.databases.test');

async function buildDatabasesViewModel() {
  const hosts = await prisma.databaseHost.findMany({
    include: {
      _count: { select: { databases: true } },
      node: { select: { id: true, name: true } },
    },
    orderBy: { id: 'asc' },
  });
  return { hosts };
}

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
          const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
          const settings = await await getSettings();
          const vm = await buildDatabasesViewModel();

          res.vary('HX-Request');
          if (req.get('HX-Request') === 'true') {
            return res.render('fragments/admin/databases/host-list', vm);
          }
          res.render('admin/databases/databases', { user, settings, req, ...vm });
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
        const settings = await await getSettings();
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
            if (req.get('HX-Request') === 'true') {
              return res.status(400).render('fragments/shared/error-banner', {
                targetId: 'database-host-form',
                message: 'Name, host, username and password are required.',
                hint: null,
              });
            }
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

          if (req.get('HX-Request') === 'true') {
            res.setHeader('HX-Redirect', '/admin/databases');
            return res.status(200).send('');
          }
          res.redirect('/admin/databases?err=none');
        } catch (error: unknown) {
          logger.error('Error creating database host:', error);
          if (req.get('HX-Request') === 'true') {
            return res.status(500).render('fragments/shared/error-banner', {
              targetId: 'database-host-form',
              message: 'Could not save the database host. Try again.',
              hint: null,
            });
          }
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

          if (req.get('HX-Request') === 'true') {
            const toastMsg = created
              ? 'Host generated and connection verified.'
              : 'Host already exists. Connection verified.';
            if (!result.success) {
              res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'error', message: result.error ? safeClientMessage(result.error, 'The database host could not be reached.') : 'Failed to auto-generate host' } } }));
              return res.status(500).send('');
            }
            const vm = await buildDatabasesViewModel();
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'success', message: toastMsg } } }));
            return res.render('fragments/admin/databases/host-list', vm);
          }

          return res.json({ success: result.success, created, hostId: host.id, latency: result.latency, error: result.error ? safeClientMessage(result.error, 'The database host could not be reached.') : undefined });
        } catch (error: unknown) {
          logger.error('Error auto-generating database host:', error);
          if (req.get('HX-Request') === 'true') {
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'error', message: 'Failed to auto-generate database host.' } } }));
            return res.status(500).send('');
          }
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

          if (req.get('HX-Request') === 'true') {
            const msg = created ? 'Bucket created.' : 'Bucket already exists.';
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'success', message: msg } } }));
            return res.status(200).send('');
          }
          return res.json({ success: true, created });
        } catch (error: unknown) {
          logger.error('Error auto-generating S3 bucket:', error);
          const message = error instanceof Error ? error.message : '';
          const unconfigured = message.includes('S3 not configured');
          const errMsg = unconfigured
            ? 'S3 is not configured. Add your S3-compatible endpoint and credentials in Admin Settings first.'
            : safeClientMessage(error, 'Failed to auto-generate S3 bucket.');

          if (req.get('HX-Request') === 'true') {
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'error', message: errMsg } } }));
            return res.status(unconfigured ? 400 : 500).send('');
          }
          return res.status(unconfigured ? 400 : 500).json({
            success: false,
            error: errMsg,
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
            if (req.get('HX-Request') === 'true') {
              res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'error', message: 'Database host not found.' } } }));
              return res.status(404).send('');
            }
            return res.status(404).json({ success: false, error: 'Database host not found.' });
          }
          const result = await testDatabaseHost(host);
          const errorMsg = result.error ? safeClientMessage(result.error, 'The database host could not be reached.') : undefined;

          if (req.get('HX-Request') === 'true') {
            const msg = result.success
              ? `Connection successful (${result.latency}ms)`
              : errorMsg || 'Connection failed';
            const type = result.success ? 'success' : 'error';
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type, message: msg } } }));
            return res.status(200).send('');
          }

          return res.json({
            ...result,
            error: errorMsg,
          });
        } catch (error: unknown) {
          logger.error('Error testing database host:', error);
          if (req.get('HX-Request') === 'true') {
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'error', message: 'Failed to test database host.' } } }));
            return res.status(500).send('');
          }
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
            if (req.get('HX-Request') === 'true') {
              return res.status(400).render('fragments/shared/error-banner', {
                targetId: 'admin-databases',
                message: 'Cannot delete host with active databases.',
                hint: null,
              });
            }
            return res.status(400).json({ success: false, error: 'Cannot delete host with active databases.' });
          }
          await prisma.databaseHost.delete({ where: { id } });

          if (req.get('HX-Request') === 'true') {
            const vm = await buildDatabasesViewModel();
            res.setHeader('HX-Trigger', JSON.stringify({ al: { toast: { type: 'success', message: 'Host deleted.' } } }));
            return res.render('fragments/admin/databases/host-list', vm);
          }
          return res.json({ success: true });
        } catch (error: unknown) {
          logger.error('Error deleting database host:', error);
          if (req.get('HX-Request') === 'true') {
            return res.status(500).render('fragments/shared/error-banner', {
              targetId: 'admin-databases',
              message: 'Failed to delete host.',
              hint: null,
            });
          }
          return res.status(500).json({ success: false, error: 'Failed to delete host.' });
        }
      },
    );

    return router;
  },
};

export default databasesModule;
