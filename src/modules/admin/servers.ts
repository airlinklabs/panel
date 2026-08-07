import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { registerPermission, Permission } from '../../handlers/permissions';
import logger from '../../handlers/logger';
import { queueer } from '../../handlers/queueer';
import { getParamAsNumber, getParamAsString } from '../../utils/typeHelpers';
import { safeClientMessage } from '../../utils/errors';
import { daemonRequest } from '../../handlers/utils/core/daemonRequest';
import {
  getUsedExternalPorts,
  normalizeServerPorts,
  parseImagePortRequirements,
  parseServerPorts,
  serializeServerPorts,
  validatePortAssignments,
  getPrimaryExternalPort,
} from '../../handlers/utils/server/ports';
import { assertNodeCapacity } from '../../handlers/utils/server/resourceCheck';
import {
  claimNodePorts,
  getNodePortPool,
  releaseServerAllocations,
  withNodePortLock,
} from '../../handlers/utils/server/allocations';
import { logActivity } from '../../handlers/utils/activity/activityLogger';
import { sendServerSuspended } from '../../handlers/utils/core/mailer';
import { startTransfer, getTransferState } from '../../handlers/utils/server/serverTransfer';

const DEFAULT_SERVER_PORT = 25565;
const DEFAULT_SERVER_PORT_RANGE = `${DEFAULT_SERVER_PORT}:${DEFAULT_SERVER_PORT}`;
const INSTALL_TIMEOUT_MS = 600_000;
const DEFAULT_STOP_COMMAND = 'stop';
const DEFAULT_DATABASE_LIMIT = 5;
const DEFAULT_BACKUP_LIMIT = 5;
const SUSPENDED_TRUE = 'true';

registerPermission('airlink.admin.servers.view' as Permission);
registerPermission('airlink.admin.servers.create' as Permission);
registerPermission('airlink.admin.servers.update' as Permission);
registerPermission('airlink.admin.servers.delete' as Permission);

const adminModule: Module = {
  info: {
    name: 'Admin Module',
    description: 'This file is for admin functionality.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/servers',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const servers = await prisma.server.findMany({
            include: {
              node: true,
              owner: true,
            },
          });
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/servers/servers', { user, req, settings, servers });
        } catch (error: unknown) {
          logger.error('Error fetching servers:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/servers/edit/:id',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.redirect('/login');
            return;
          }

          const serverId = getParamAsNumber(req.params.id);
          if (isNaN(serverId)) {
            res.status(400).send('Invalid server ID');
            return;
          }

          const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: {
              node: true,
              owner: true,
              image: true,
              serverMounts: { include: { mount: true } },
            },
          });

          if (!server) {
            res.status(404).send('Server not found');
            return;
          }

          const users = await prisma.users.findMany();
          const nodes = await prisma.node.findMany();
          const images = await prisma.images.findMany();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          const mounts = await prisma.mount.findMany();
          const serverMounts = await prisma.serverMount.findMany({
            where: { serverId: server.UUID },
          });

          res.render('admin/servers/edit', {
            user,
            req,
            settings,
            server,
            nodes,
            images,
            users,
            mounts,
            serverMounts,
          });
        } catch (error: unknown) {
          logger.error('Error fetching server for editing:', error);
          res.redirect('/admin/servers');
          return;
        }
      },
    );

    router.post(
      '/admin/servers/edit/:id',
      isAuthenticated(true, 'airlink.admin.servers.update'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          const serverId = getParamAsNumber(req.params.id);
          if (isNaN(serverId)) {
            res.status(400).json({ error: 'Invalid server ID' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: { node: true, image: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const {
            name,
            description,
            nodeId,
            imageId,
            Memory,
            Swap,
            Cpu,
            Storage,
            ownerId,
            allowStartupEdit,
            Suspended,
            StartCommand,
            databaseLimit,
            backupLimit,
            backupIgnoreList,
            ports,
          } = req.body;

          // Validate required fields
          if (!name || !nodeId || !imageId || !Memory || !Cpu || !Storage || !ownerId) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
          }

          const memInt = parseInt(String(Memory), 10);
          const cpuInt = parseInt(String(Cpu), 10);
          const storageInt = parseInt(String(Storage), 10);
          const swapInt = Swap !== undefined && Swap !== '' ? Math.max(0, parseInt(String(Swap), 10) || 0) : 0;
          if (isNaN(memInt) || memInt <= 0 || isNaN(cpuInt) || cpuInt <= 0 || isNaN(storageInt) || storageInt <= 0) {
            res.status(400).json({ error: 'Memory, CPU, and Storage must be positive integers.' });
            return;
          }

          const owner = await prisma.users.findUnique({ where: { id: parseInt(String(ownerId), 10) } });
          if (!owner) {
            res.status(400).json({ error: 'Owner not found' });
            return;
          }

          // Check if suspension status is changing
          const currentSuspendedState = server.Suspended;
          const newSuspendedState = Suspended === SUSPENDED_TRUE;
          const suspensionChanged = currentSuspendedState !== newSuspendedState;

          const selectedImage = await prisma.images.findUnique({ where: { id: parseInt(imageId) } });
          if (!selectedImage) {
            res.status(400).json({ error: 'Image not found' });
            return;
          }

          const submittedPorts = normalizeServerPorts(ports);
          const minPorts = parseImagePortRequirements(selectedImage.portRequirements).length;
          const pool = await getNodePortPool(parseInt(nodeId));
          const existingServers = await prisma.server.findMany({
            where: { nodeId: parseInt(nodeId), NOT: { id: serverId } },
          });
          const portError = validatePortAssignments(submittedPorts, pool, getUsedExternalPorts(existingServers), minPorts);
          if (portError) {
            res.status(400).json({ error: portError });
            return;
          }

          try {
            const capacityNode = server.nodeId === parseInt(nodeId)
              ? server.node
              : await prisma.node.findUnique({ where: { id: parseInt(nodeId) } });
            if (!capacityNode) {
              res.status(400).json({ error: 'Target node not found.' });
              return;
            }
            await assertNodeCapacity(
              capacityNode,
              memInt,
              cpuInt,
              storageInt,
              server.UUID,
            );
          } catch (error: unknown) {
            res.status(400).json({ error: error instanceof Error ? error.message : 'Node capacity exceeded.' });
            return;
          }

          await prisma.server.update({
            where: { id: serverId },
            data: {
              name,
              description,
              ownerId: parseInt(ownerId),
              nodeId: parseInt(nodeId),
              imageId: parseInt(imageId),
              Memory: memInt,
              Swap: swapInt,
              Cpu: cpuInt,
              Storage: storageInt,
              StartCommand,
              databaseLimit: databaseLimit !== undefined && databaseLimit !== '' ? Math.max(0, parseInt(databaseLimit) || 0) : DEFAULT_DATABASE_LIMIT,
              backupLimit: backupLimit !== undefined && backupLimit !== '' ? Math.max(0, parseInt(backupLimit) || 0) : DEFAULT_BACKUP_LIMIT,
              backupIgnoreList: typeof backupIgnoreList === 'string' ? backupIgnoreList.trim() : '',
              Ports: serializeServerPorts(submittedPorts),
              Suspended: newSuspendedState,
            },
          });

          // Update allowStartupEdit field using raw SQL
          await prisma.$executeRaw`UPDATE "Server" SET "allowStartupEdit" = ${allowStartupEdit === 'true'} WHERE "id" = ${serverId}`;

          // Reconcile port claims: if the node changed, release old claims, then
          // claim the server's new ports (idempotent when nothing changed).
          try {
            if (server.nodeId !== parseInt(nodeId)) {
              await releaseServerAllocations(server.UUID);
            }
            await claimNodePorts(parseInt(nodeId), submittedPorts.map((p) => p.externalPort), server.UUID);
          } catch (err: unknown) {
            logger.error('Error syncing allocation claims:', err);
          }

          // If server is being suspended, stop it
          if (suspensionChanged && newSuspendedState) {
            try {
              logger.info(`Stopping server ${server.UUID} due to suspension`);

              await daemonRequest({
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                method: 'POST',
                path: '/container/stop',
                body: {
                  id: String(server.UUID),
                  stopCmd: server.image?.stop || DEFAULT_STOP_COMMAND,
                },
              });

              await prisma.server.update({ where: { UUID: String(server.UUID) }, data: { Running: false } }).catch(() => {});
              logger.info(`Server ${server.UUID} stopped successfully due to suspension`);
            } catch (stopError) {
              logger.error(`Error stopping server ${server.UUID} during suspension:`, stopError);
              // Continue with the update even if stopping fails
            }
          }

          logger.info(`Server ${serverId} updated successfully`);
          await logActivity(req, 'server:update', { serverId: String(server.UUID), metadata: { name, suspended: newSuspendedState } });

          // Reconcile server mounts
          try {
            const rawMountIds = req.body.mountIds;
            const nextMountIds: number[] = Array.isArray(rawMountIds)
              ? rawMountIds.map((m: unknown) => Number(String(m)).valueOf()).filter((v) => Number.isInteger(v))
              : typeof rawMountIds === 'string'
                ? [Number(rawMountIds)].filter((v) => Number.isInteger(v))
                : [];
            await prisma.serverMount.deleteMany({ where: { serverId: server.UUID } });
            if (nextMountIds.length > 0) {
              await prisma.serverMount.createMany({
                data: nextMountIds.map((mountId: number) => ({ serverId: server.UUID, mountId })),
              });
            }
          } catch (mountError) {
            logger.error('Error syncing server mounts:', mountError);
          }

          res.status(200).json({ success: true });
        } catch (error: unknown) {
          logger.error('Error updating server:', error);
          res.status(500).json({ error: 'Failed to update server' });
          return;
        }
      },
    );

    router.get(
      '/admin/servers/create',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const users = await prisma.users.findMany();
          const nodes = await prisma.node.findMany();
          const images = await prisma.images.findMany();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/servers/create', {
            user,
            req,
            settings,
            nodes,
            images,
            users,
          });
        } catch (error: unknown) {
          logger.error('Error fetching data for server creation:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/servers/create',
      isAuthenticated(true, 'airlink.admin.servers.create'),
      async (req: Request, res: Response) => {
        const {
          name,
          description,
          nodeId,
          imageId,
          Ports,
          ports,
          Memory,
          Swap,
          Cpu,
          Storage,
          dockerImage,
          variables,
          ownerId,
          databaseLimit,
          allowStartupEdit,
        } = req.body;

        const userId = parseInt(String(ownerId), 10);
        if (
          !name ||
          !description ||
          !nodeId ||
          !imageId ||
          (!Ports && !ports) ||
          !Memory ||
          !Cpu ||
          !Storage ||
          !userId
        ) {
          res.status(400).json({ error: 'Missing required fields' });
          return;
        }

        const memInt = parseInt(String(Memory), 10);
        const cpuInt = parseInt(String(Cpu), 10);
        const storageInt = parseInt(String(Storage), 10);
        const swapInt = Swap !== undefined && Swap !== '' ? Math.max(0, parseInt(String(Swap), 10) || 0) : 0;
        if (isNaN(memInt) || memInt <= 0 || isNaN(cpuInt) || cpuInt <= 0 || isNaN(storageInt) || storageInt <= 0) {
          res.status(400).json({ error: 'Memory, CPU, and Storage must be positive integers.' });
          return;
        }

        const owner = await prisma.users.findUnique({ where: { id: userId } });
        if (!owner) {
          res.status(400).json({ error: 'Owner not found' });
          return;
        }

        // Validate that the selected port is allocated to the node and not already in use
        let minPorts = 0;
        try {
          const node = await prisma.node.findUnique({
            where: { id: parseInt(nodeId) }
          });

          if (!node) {
            res.status(400).json({ error: 'Selected node not found' });
            return;
          }

          if (node.maintenanceMode) {
            res.status(400).json({ error: 'Cannot create a server on a node under maintenance' });
            return;
          }

          const pool = await getNodePortPool(parseInt(nodeId));

          const existingServers = await prisma.server.findMany({
            where: {
              nodeId: parseInt(nodeId)
            }
          });

          const image = await prisma.images.findUnique({ where: { id: parseInt(imageId) } });
          if (!image) {
            res.status(400).json({ error: 'Image not found' });
            return;
          }

          const submittedPorts = ports ? normalizeServerPorts(ports) : parseServerPorts(`[{"Port":"${Ports}","primary":true}]`);
          minPorts = parseImagePortRequirements(image.portRequirements).length;
          const portError = validatePortAssignments(submittedPorts, pool, getUsedExternalPorts(existingServers), minPorts);
          if (portError) {
            res.status(400).json({ error: portError });
            return;
          }

          await assertNodeCapacity(
            node,
            parseInt(Memory) || 1024,
            parseInt(Cpu) || 100,
            parseInt(Storage) || 20480,
          );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error validating port allocation';
            logger.error('Error validating server resources:', error);
            res.status(400).json({ error: message });
            return;
          }

        const Port = serializeServerPorts(ports ? normalizeServerPorts(ports) : parseServerPorts(`[{"Port":"${Ports}","primary":true}]`));

        try {
          const selectedImage = await prisma.images.findUnique({
            where: {
              id: parseInt(imageId),
            },
          });

          if (!selectedImage) {
            res.status(400).json({ error: 'Image not found' });
            return;
          }

          const dockerImagesRaw = selectedImage.dockerImages;
          if (!dockerImagesRaw) {
            res.status(400).json({ error: 'Docker image not found' });
            return;
          }

          type ImageDocker = { [key: string]: string };

          const imagesDocker: ImageDocker[] = JSON.parse(dockerImagesRaw);
          const imageDocker: ImageDocker | undefined = imagesDocker.find(
            (image: ImageDocker) => Object.keys(image).includes(dockerImage),
          );

          if (!imageDocker) {
            res.status(400).json({ error: 'Docker image not found' });
            return;
          }

          const StartCommand = selectedImage.startup;

          if (!StartCommand) {
            res.status(400).json({ error: 'Image startup command not found' });
            return;
          }

          // Merge submitted variable values into the egg variable definitions
          let imageVariables: Record<string, unknown>[] = [];
          try {
            imageVariables = JSON.parse(selectedImage.variables || '[]');
          } catch {
            imageVariables = [];
          }

          const submittedVars = Array.isArray(variables) ? variables : [];
          const mergedVariables = imageVariables.map((imgVar: Record<string, unknown>) => {
            const envKey = String(imgVar.env_variable ?? imgVar.env ?? '');
            const submitted = submittedVars.find(
              (sv: Record<string, unknown>) => String(sv.env_variable ?? sv.env ?? '') === envKey,
            );
            return { ...imgVar, value: submitted?.value ?? imgVar.default_value ?? '' };
          });

          // Create server — under a per-node lock so the port pool doesn't race
          // with other concurrent creates on the same node.
          const submittedExternal = (ports ? normalizeServerPorts(ports) : parseServerPorts(`[{"Port":"${Ports}","primary":true}]`))
            .map((p) => p.externalPort);

          let createdServer;
          try {
            createdServer = await withNodePortLock(parseInt(nodeId), async () => {
              const livePool = await getNodePortPool(parseInt(nodeId));
              const liveServers = await prisma.server.findMany({ where: { nodeId: parseInt(nodeId) } });
              const recheck = validatePortAssignments(
                ports ? normalizeServerPorts(ports) : parseServerPorts(`[{"Port":"${Ports}","primary":true}]`),
                livePool,
                getUsedExternalPorts(liveServers),
                minPorts,
              );
              if (recheck) throw new Error(recheck);

              const created = await prisma.server.create({
                data: {
                  name,
                  description,
                  ownerId: userId,
                  nodeId: parseInt(nodeId),
                  imageId: parseInt(imageId),
                  Ports: Port || '[{"Port": "25565:25565", "primary": true}]',
                  Memory: memInt,
                  Swap: swapInt,
                  Cpu: cpuInt,
                  databaseLimit: databaseLimit !== undefined && databaseLimit !== '' ? Math.max(0, parseInt(databaseLimit) || 0) : 5,
                  Storage: storageInt,
                  Variables: JSON.stringify(mergedVariables),
                  StartCommand,
                  dockerImage: JSON.stringify(imageDocker),
                },
              });

              await prisma.$executeRaw`UPDATE "Server" SET "allowStartupEdit" = ${allowStartupEdit === 'true'} WHERE "id" = ${created.id}`;
              await claimNodePorts(parseInt(nodeId), submittedExternal, created.UUID).catch((err: unknown) => {
                logger.warn(`Failed to claim ports for server ${created.UUID}: ${err instanceof Error ? err.message : err}`);
              });
              return created;
            });
          } catch (error: unknown) {
            logger.error('Error creating server:', error);
            res.status(400).send(error instanceof Error ? error.message : 'Failed to create server.');
            return;
          }

          queueer.addTask(async () => {
            const servers = await prisma.server.findMany({
              where: {
                Queued: true,
              },
              include: {
                image: true,
                node: true,
              },
            });

            for (const server of servers) {
              if (!server.Variables) {
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              let ServerEnv: Array<{ env: string; value: unknown }>;
              try {
                const parsed: unknown[] = JSON.parse(server.Variables);

                // Normalize variable shape — Pterodactyl uses env_variable, legacy uses env
                ServerEnv = (parsed as Record<string, unknown>[]).map((v) => ({
                  env: String(v.env_variable ?? v.env ?? ''),
                  value: v.value ?? v.default_value ?? '',
                }));

                let serverPort = String(parseServerPorts(Port)[0]?.externalPort ?? '');
                const primaryExternalPort = getPrimaryExternalPort(server.Ports);
                if (primaryExternalPort) {
                  serverPort = String(primaryExternalPort);
                }
                ServerEnv.push({
                  env: 'SERVER_PORT',
                  value: serverPort,
                });
                ServerEnv.push({
                  env: 'SERVER_MEMORY',
                  value: String(server.Memory),
                });
                ServerEnv.push({
                  env: 'SERVER_CPU',
                  value: String(server.Cpu),
                });
              } catch (error: unknown) {
                logger.error(`Error parsing Variables for server ID ${server.id}:`, error);
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              if (!Array.isArray(ServerEnv)) {
                logger.error(`ServerEnv is not an array for server ID ${server.id}. Skipping...`);
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              const env = ServerEnv.reduce(
                (
                  acc: Record<string, unknown>,
                  curr: { env: string; value: unknown },
                ) => {
                  acc[curr.env] = curr.value;
                  return acc;
                },
                {},
              );

              if (server.image?.scripts) {
                let scripts: Record<string, unknown>;
                try {
                  scripts = JSON.parse(server.image.scripts);
                } catch (error: unknown) {
                  logger.error(`Error parsing scripts for server ID ${server.id}:`, error);
                  await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
                  continue;
                }

                try {
                  // Pterodactyl egg format: scripts.installation has script, container, entrypoint
                  if (scripts.installation && typeof scripts.installation === 'object') {
                    const installation = scripts.installation as Record<string, string>;

                    await daemonRequest({
                      nodeAddress: server.node.address,
                      nodePort: server.node.port,
                      nodeKey: server.node.key,
                      method: 'POST',
                      path: '/container/installer',
                      body: {
                        id: server.UUID,
                        script: installation.script,
                        container: installation.container,
                        entrypoint: installation.entrypoint || 'bash',
                        env,
                      },
                      timeout: 600000,
                    });

                  // Legacy ALC format: scripts.install is an array of file downloads
                  } else if (Array.isArray(scripts.install)) {
                    // Resolve the docker image so the daemon pulls it during
                    // install rather than on the first Start click.
                    let dockerImageValue: string | undefined;
                    try {
                      const parsed = JSON.parse(server.dockerImage || '{}');
                      dockerImageValue = Object.values(parsed)[0] as string | undefined;
                    } catch { /* leave undefined */ }

                    await daemonRequest({
                      nodeAddress: server.node.address,
                      nodePort: server.node.port,
                      nodeKey: server.node.key,
                      method: 'POST',
                      path: '/container/install',
                      body: {
                        id: server.UUID,
                        image: dockerImageValue,
                        env,
                        scripts: (scripts.install as Array<Record<string, unknown>>).map((s) => ({
                          url: s.url,
                          onStartup: s.onStart,
                          ALVKT: s.ALVKT,
                          fileName: s.fileName,
                        })),
                      },
                    });

                    if (scripts.native && typeof scripts.native === 'object') {
                      const native = scripts.native as Record<string, string>;
                      await daemonRequest({
                        nodeAddress: server.node.address,
                        nodePort: server.node.port,
                        nodeKey: server.node.key,
                        method: 'POST',
                        path: '/container/installer',
                        body: { id: server.UUID, env, script: native.CMD, container: native.container, entrypoint: 'bash' },
                        timeout: 600000,
                      });
                    }
                  } else {
                    logger.info(`No install scripts for server ${server.id}, marking as installed`);
                  }

                  await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
                } catch (error: unknown) {
                  logger.error(`Error sending install request for server ID ${server.id}:`, error);
                  await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
                }
              } else {
                logger.warn(`No scripts found for server ID ${server.id}, marking as installed`);
                await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
              }
            }
          });

          res.status(200).json({ success: true, message: 'Server created successfully' });
          await logActivity(req, 'server:create', { serverId: String(createdServer.UUID), metadata: { name, nodeId: createdServer.nodeId } });
        } catch (error: unknown) {
          logger.error('Error creating server:', error);
          res.status(500).json({ error: 'Error creating server' });
        }
      },
    );

    router.post(
      '/admin/server/delete/:id',
      isAuthenticated(true, 'airlink.admin.servers.delete'),
      async (req: Request, res: Response) => {
        const { id } = req.params;

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.redirect('/login');
            return;
          }

          const serverId = getParamAsNumber(id);
          if (isNaN(serverId)) {
            res.status(400).json({ error: 'Invalid server ID' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: { node: true, image: true, owner: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const force = req.query.force === 'true';

          try {
            if (!force) {
              logger.info(`Deleting container ${server.UUID} on node ${server.node.address}:${server.node.port}`);

              try {
                const response = await daemonRequest({
                  nodeAddress: server.node.address,
                  nodePort: server.node.port,
                  nodeKey: server.node.key,
                  method: 'DELETE',
                  path: '/container',
                  body: {
                    id: server.UUID,
                  },
                });

                if (response.status !== 200) {
                  const responseData = response.data as Record<string, unknown> | undefined;
                  const isNotFound =
                    response.status === 404 ||
                    (responseData && typeof responseData === 'object' && 'error' in responseData &&
                     typeof responseData.error === 'string' &&
                     responseData.error.includes('not exist'));

                  if (isNotFound) {
                    logger.warn(`Container ${server.UUID} not found on daemon, proceeding with database cleanup`);
                  } else {
                    logger.error(`Daemon returned unexpected status ${response.status}:`, response.data);
                    throw new Error(`Daemon returned an unexpected response (status ${response.status})`);
                  }
                } else {
                  logger.info(`Successfully deleted container ${server.UUID} on daemon`);
                }
              } catch (error: unknown) {
                logger.error('Error deleting container on daemon:', error);
                throw new Error(
                  `${safeClientMessage(error, 'The daemon is unreachable')} Use ?force=true to remove from panel only.`,
                  { cause: error },
                );
              }
            }

            logger.info(`Deleting server ${serverId} from database`);
            await prisma.$transaction(async (tx) => {
              await tx.sftpCredential.deleteMany({
                where: { serverId: server.UUID },
              });
              await tx.backup.deleteMany({
                where: { serverId: server.UUID },
              });
              await tx.serverFolderMember.deleteMany({
                where: { serverUUID: server.UUID },
              });
              await tx.activityLog.deleteMany({
                where: { serverId: server.UUID },
              });
              await tx.server.delete({ where: { id: serverId } });
            });
            await releaseServerAllocations(server.UUID).catch(() => {});

            logger.info(`Server ${serverId} successfully deleted`);
            await logActivity(req, 'server:delete', { metadata: { name: server.name, nodeId: server.nodeId, serverUUID: server.UUID } });
            res.redirect('/admin/servers');
            return;
          } catch (error: unknown) {
            logger.error('Error deleting server:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: `Failed to delete server: ${errorMessage}` });
            return;
          }
        } catch (error: unknown) {
          logger.error('Error in delete server route:', error);
          res.status(500).json({ error: 'Error deleting server' });
        }
      },
    );

    router.post(
      '/admin/servers/:id/suspend',
      isAuthenticated(true, 'airlink.admin.servers.update'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          const serverId = getParamAsNumber(req.params.id);
          if (isNaN(serverId)) {
            res.status(400).json({ error: 'Invalid server ID' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          await prisma.server.update({
            where: { id: serverId },
            data: { Suspended: true },
          });

          try {
            await daemonRequest({
              method: 'POST',
              path: '/container/stop',
              nodeAddress: server.node?.address ?? '',
              nodePort: server.node?.port ?? 0,
              nodeKey: server.node?.key ?? '',
              body: { id: server.UUID },
            });
            await prisma.server.update({ where: { UUID: String(server.UUID) }, data: { Running: false } }).catch(() => {});
          } catch {
            // ignore if already stopped
          }

          logger.info(`Server ${serverId} suspended by user ${userId}`);
          await logActivity(req, 'server:suspend', { serverId: String(server.UUID), metadata: { name: server.name } });

          const owner = server.ownerId
            ? await prisma.users.findUnique({ where: { id: Number(server.ownerId) }, select: { email: true } })
            : null;
          if (owner?.email) {
            await sendServerSuspended({
              to: owner.email,
              panelName: 'Airlink',
              serverName: server.name,
              panelUrl: process.env.PANEL_URL ?? '',
            });
          }

          res.json({ success: true, message: 'Server suspended' });
        } catch (error: unknown) {
          logger.error('Error suspending server:', error);
          res.status(500).json({ error: 'Failed to suspend server' });
        }
      },
    );

    router.post(
      '/admin/servers/:id/unsuspend',
      isAuthenticated(true, 'airlink.admin.servers.update'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          const serverId = getParamAsNumber(req.params.id);
          if (isNaN(serverId)) {
            res.status(400).json({ error: 'Invalid server ID' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { id: serverId },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          await prisma.server.update({
            where: { id: serverId },
            data: { Suspended: false },
          });

          logger.info(`Server ${serverId} unsuspended by user ${userId}`);
          await logActivity(req, 'server:unsuspend', { serverId: String(server.UUID), metadata: { name: server.name } });
          res.json({ success: true, message: 'Server unsuspended' });
        } catch (error: unknown) {
          logger.error('Error unsuspending server:', error);
          res.status(500).json({ error: 'Failed to unsuspend server' });
        }
      },
    );

    // ── Server Transfer ──────────────────────────────────────────────────

    router.post(
      '/admin/servers/:id/transfer',
      isAuthenticated(true, 'airlink.admin.servers.update'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          const serverId = getParamAsNumber(req.params.id);
          if (isNaN(serverId)) {
            res.status(400).json({ error: 'Invalid server ID' });
            return;
          }

          const { targetNodeId, ports } = req.body;
          if (!targetNodeId || !Array.isArray(ports) || ports.length === 0) {
            res.status(400).json({ error: 'Missing targetNodeId or ports' });
            return;
          }

          const targetNodeIdNum = parseInt(targetNodeId);
          if (isNaN(targetNodeIdNum)) {
            res.status(400).json({ error: 'Invalid target node ID' });
            return;
          }

          const normalizedPorts = ports.map((p: Record<string, unknown>) => ({
            name: String(p.name || `Port ${p.externalPort}`),
            internalPort: parseInt(String(p.internalPort)) || parseInt(String(p.externalPort)) || DEFAULT_SERVER_PORT,
            externalPort: parseInt(String(p.externalPort)) || DEFAULT_SERVER_PORT,
            primary: p.primary === true,
          }));

          const state = await startTransfer(serverId, targetNodeIdNum, normalizedPorts, req);

          await logActivity(req, 'server:transfer', {
            serverId: String(state.serverUUID),
            metadata: {
              name: state.serverName,
              fromNodeId: state.sourceNodeId,
              toNodeId: state.targetNodeId,
            },
          });

          res.json({ success: true, transferId: serverId });
        } catch (error: unknown) {
          logger.error('Error starting transfer:', error);
          res.status(400).json({ error: safeClientMessage(error, 'Failed to start transfer') });
        }
      },
    );

    router.get(
      '/admin/servers/:id/transfer/status',
      isAuthenticated(true, 'airlink.admin.servers.view'),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsNumber(req.params.id);
          if (isNaN(serverId)) {
            res.status(400).json({ error: 'Invalid server ID' });
            return;
          }

          const state = getTransferState(serverId);
          if (!state) {
            res.json({ status: 'idle' });
            return;
          }

          res.json({
            status: state.status,
            error: state.error,
            startedAt: state.startedAt,
            completedAt: state.completedAt,
            serverName: state.serverName,
            sourceNodeId: state.sourceNodeId,
            targetNodeId: state.targetNodeId,
          });
        } catch (error: unknown) {
          logger.error('Error getting transfer status:', error);
          res.status(500).json({ error: 'Failed to get transfer status' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
