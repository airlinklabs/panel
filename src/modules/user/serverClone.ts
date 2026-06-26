import { Router, Request, Response } from 'express';
import { Module } from '../../core/moduleInit';
import prisma from '../../db';
import { isAuthenticatedForServer } from '../../middleware/serverAuth';
import logger from '../../services/logger';
import { getParamAsString } from '../../utils/typeHelpers';
import {
  getUsedExternalPorts,
  parseImagePortRequirements,
  serializeServerPorts,
} from '../../services/ports';

interface ErrorMessage {
  message?: string;
}

function pickAvailablePorts(allocatedPorts: number[], usedPorts: number[], count: number): number[] {
  const picked: number[] = [];
  for (const port of allocatedPorts) {
    if (!usedPorts.includes(port)) picked.push(port);
    if (picked.length === count) return picked;
  }
  return picked;
}

const serverCloneModule: Module = {
  info: {
    name: 'Server Clone Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/server/:id/clone',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            return res.render('user/account', { errorMessage, user, req });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true, owner: true },
          });

          if (!server) {
            errorMessage.message = 'Server not found.';
            return res.render('user/server/clone', {
              errorMessage,
              user,
              server: null,
              req,
            });
          }

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('user/server/clone', {
            errorMessage,
            user,
            server,
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error loading clone page:', error);
          errorMessage.message = 'Error loading clone page.';
          res.render('user/server/clone', {
            errorMessage,
            user: req.session?.user,
            server: null,
            req,
          });
        }
      },
    );

    router.post(
      '/server/:id/clone',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);
        const { name } = req.body;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.status(404).json({ error: 'User not found.' });
          }

          if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Server name is required.' });
          }

          const originalServer = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!originalServer) {
            return res.status(404).json({ error: 'Server not found.' });
          }

          const node = await prisma.node.findUnique({
            where: { id: originalServer.nodeId },
          });

          if (!node) {
            return res.status(500).json({ error: 'Node not found.' });
          }

          let allocatedPorts: number[] = [];
          try {
            if (node.allocatedPorts) allocatedPorts = JSON.parse(node.allocatedPorts);
          } catch {
            return res.status(500).json({ error: 'Node port configuration is invalid.' });
          }

          const portRequirements = parseImagePortRequirements(
            await prisma.images.findUnique({ where: { id: originalServer.imageId } })
              .then(img => img?.portRequirements ?? '[]'),
          );
          const requiredPortCount = Math.max(1, portRequirements.length);
          const existingServers = await prisma.server.findMany({ where: { nodeId: node.id } });
          const assignedPorts = pickAvailablePorts(
            allocatedPorts,
            getUsedExternalPorts(existingServers),
            requiredPortCount,
          );

          if (assignedPorts.length < requiredPortCount) {
            return res.status(503).json({
              error: `No available ports on the selected node. ${requiredPortCount} port(s) required.`,
            });
          }

          const portsJson = serializeServerPorts(
            assignedPorts.map((externalPort, index) => {
              const requirement = portRequirements[index];
              return {
                name: requirement?.name || `Port ${index + 1}`,
                internalPort: requirement?.internalPort || externalPort,
                externalPort,
                primary: index === 0,
              };
            }),
          );

          const clonedServer = await prisma.server.create({
            data: {
              name: name.trim(),
              description: originalServer.description,
              ownerId: userId,
              nodeId: originalServer.nodeId,
              imageId: originalServer.imageId,
              Ports: portsJson,
              Memory: originalServer.Memory,
              Cpu: originalServer.Cpu,
              Storage: originalServer.Storage,
              Variables: originalServer.Variables,
              StartCommand: originalServer.StartCommand,
              dockerImage: originalServer.dockerImage,
              Installing: true,
              Queued: true,
            },
          });

          res.status(201).json({ success: true, serverUUID: clonedServer.UUID });
        } catch (error) {
          logger.error('Error cloning server:', error);
          res.status(500).json({ error: 'Failed to clone server.' });
        }
      },
    );

    return router;
  },
};

export default serverCloneModule;
