import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { parseServerPorts, serializeServerPorts, getPrimaryExternalPort, getUsedExternalPorts } from '../../../handlers/utils/server/ports';
import {
  claimNodePorts,
  getNodePortPool,
  releaseNodePorts,
} from '../../../handlers/utils/server/allocations';
import {
  type ErrorMessage,
  getImageFeatures,
} from './shared';

export function registerSettingsRoutes(router: Router): void {
  router.get(
    '/server/:id/settings',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('settings'),
    async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          errorMessage.message = 'User not found.';
          return res.render('user/account', { errorMessage, user, req });
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true, image: true, owner: true },
        });

        if (!server) {
          errorMessage.message = 'Server not found.';
          return res.render('user/server/settings', {
            errorMessage,
            features: [],
            user,
            req,
            settings,
          });
        }

        const features = getImageFeatures(server.image);

        return res.render('user/server/settings', {
          errorMessage,
          features,
          installed: await checkForServerInstallation(getParamAsString(serverId)),
          user,
          req,
          server,
          settings,
        });
      } catch (error) {
        logger.error('Error fetching server settings data:', error);
        errorMessage.message = 'Error fetching server data.';
        return res.render('user/server/settings', {
          errorMessage,
          features: [],
          user: req.session?.user,
          req,
          settings,
        });
      }
    },
  );

  router.post(
    '/server/:id/settings',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('settings'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const { name, description } = req.body;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { image: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        await prisma.server.update({
          where: { UUID: getParamAsString(serverId) },
          data: {
            name: name,
            description: description,
          },
        });

        res.status(200).json({ success: true });
      } catch (error) {
        logger.error('Error updating server settings:', error);
        res.status(500).json({ error: 'Failed to update server settings' });
      }
    },
  );

  // ── GET /server/:id/settings/allocations ─────────────────────────────────
  // Returns the server's current allocations plus the node's unclaimed ports,
  // so the owner can add or remove ports themselves.
  router.get(
    '/server/:id/settings/allocations',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('allocation.read'),
    async (req: Request, res: Response) => {
      try {
        const serverId = getParamAsString(req.params?.id);
        const server = await prisma.server.findUnique({
          where: { UUID: serverId },
          include: { node: true },
        });
        if (!server || !server.node) {
          res.status(404).json({ error: 'Server or node not found' });
          return;
        }

        const current = parseServerPorts(server.Ports);

        const pool = await getNodePortPool(server.nodeId);
        const claimed = await prisma.allocation.findMany({
          where: { nodeId: server.nodeId, serverId: { not: null } },
        });
        const claimedPorts = new Set(claimed.map((a) => a.port));
        const available = pool.filter((p) => !claimedPorts.has(p));

        // Expose actual Allocation guarantees where they exist.
        const tracked = await prisma.allocation.findMany({
          where: { serverId },
        });

        res.status(200).json({
          allocated: current.map((p) => ({
            external: p.externalPort,
            internal: p.internalPort,
            name: p.name,
            primary: p.primary,
            tracked: tracked.some((a) => a.port === p.externalPort),
          })),
          available,
        });
      } catch (error) {
        logger.error('Error fetching server allocations:', error);
        res.status(500).json({ error: 'Failed to fetch allocations.' });
      }
    },
  );

  // ── POST /server/:id/settings/allocations ────────────────────────────────
  // Claim an extra, currently-unassigned port from the node pool for this server.
  router.post(
    '/server/:id/settings/allocations',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('allocation.create'),
    async (req: Request, res: Response) => {
      try {
        const serverId = getParamAsString(req.params?.id);
        const external = Number(req.body?.port);
        if (!Number.isInteger(external) || external < 1 || external > 65535) {
          res.status(400).json({ error: 'A valid port number is required.' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: serverId },
          include: { node: true },
        });
        if (!server || !server.node) {
          res.status(404).json({ error: 'Server or node not found' });
          return;
        }

        const pool = await getNodePortPool(server.nodeId);
        if (!pool.includes(external)) {
          res.status(400).json({ error: `Port ${external} is not allocated to this node.` });
          return;
        }

        const existing = await prisma.server.findMany({
          where: { nodeId: server.nodeId },
          select: { Ports: true },
        });
        const inUse = getUsedExternalPorts(existing);
        if (inUse.includes(external)) {
          res.status(400).json({ error: `Port ${external} is already in use.` });
          return;
        }

        const claimed = await claimNodePorts(server.nodeId, [external], serverId);
        if (claimed === 0) {
          res.status(400).json({ error: `Port ${external} is already claimed by another server.` });
          return;
        }

        const ports = parseServerPorts(server.Ports);
        const primary = getPrimaryExternalPort(server.Ports);
        ports.push({
          name: `Port ${external}`,
          internalPort: external,
          externalPort: external,
          primary: primary === undefined,
        });
        await prisma.server.update({
          where: { UUID: serverId },
          data: { Ports: serializeServerPorts(ports) },
        });

        res.status(200).json({ success: true, allocated: ports.map((p) => p.externalPort) });
      } catch (error) {
        logger.error('Error claiming allocation:', error);
        res.status(500).json({ error: 'Failed to claim allocation.' });
      }
    },
  );

  // ── DELETE /server/:id/settings/allocations/:port ────────────────────────
  // Releases a non-primary port back to the node pool.
  router.delete(
    '/server/:id/settings/allocations/:port',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('allocation.delete'),
    async (req: Request, res: Response) => {
      try {
        const serverId = getParamAsString(req.params?.id);
        const external = Number(req.params?.port);
        if (!Number.isInteger(external)) {
          res.status(400).json({ error: 'A valid port number is required.' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: serverId },
          include: { node: true },
        });
        if (!server || !server.node) {
          res.status(404).json({ error: 'Server or node not found' });
          return;
        }

        const ports = parseServerPorts(server.Ports);
        const target = ports.find((p) => p.externalPort === external);
        if (!target) {
          res.status(404).json({ error: 'Allocation not found on this server.' });
          return;
        }
        if (target.primary) {
          res.status(400).json({ error: 'The primary allocation cannot be removed.' });
          return;
        }

        await releaseNodePorts(server.nodeId, [external]);
        await prisma.server.update({
          where: { UUID: serverId },
          data: { Ports: serializeServerPorts(ports.filter((p) => p.externalPort !== external)) },
        });

        res.status(200).json({ success: true });
      } catch (error) {
        logger.error('Error releasing allocation:', error);
        res.status(500).json({ error: 'Failed to release allocation.' });
      }
    },
  );
}
