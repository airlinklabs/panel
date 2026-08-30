import { getSettings } from "../../../handlers/settingsCache";
import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { Module } from "../../../handlers/moduleInit";
import prisma from "../../../db";
import logger from "../../../handlers/logger";
import { queueer } from "../../../handlers/queueer";
import type { Prisma } from "../../../generated/prisma/client";
import bcrypt from "bcryptjs";
import { getParamAsNumber } from "../../../utils/typeHelpers";
import { daemonRequest } from "../../../handlers/utils/core/daemonRequest";
import { getUsedExternalPorts } from "../../../handlers/utils/server/ports";
import { apiValidator } from "../../../handlers/utils/api/apiValidator";
import {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MEMORY_MB,
  DEFAULT_CPU_PERCENT,
  DEFAULT_STORAGE_MB,
} from "../../../config/constants";

const PTERO_MEMORY_MB = 1024;
const PTERO_DISK_MB = 1024;

// Legacy application API wrapper. The canonical `apiValidator` is hash-aware,
// enforces `active`, applies a constant-time delay on invalid keys and never
// logs the raw key. To preserve the legacy client contract it normalizes only
// the invalid/inactive-key responses (403 / inactive 401) down to the legacy
// 401 body while leaving malformed-header 401s and 5xx untouched.
const legacyInvalidKeyBody = { error: "Unauthorized: Invalid API Key" };

export const legacyApiValidator = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const originalStatus = res.status.bind(res);
  const originalJson = res.json.bind(res);

  let pendingStatus = 0;

  res.status = ((code: number) => {
    pendingStatus = code;
    return originalStatus(code);
  }) as typeof res.status;

  res.json = ((body: unknown) => {
    const json = body as { error?: string } | undefined;
    const inactiveKey =
      pendingStatus === 401 &&
      json?.error === "Unauthorized: API Key is inactive";
    const invalidKey = pendingStatus === 403;

    if (inactiveKey || invalidKey) {
      originalStatus(401);
      return originalJson(legacyInvalidKeyBody);
    }

    return originalJson(body);
  }) as typeof res.json;

  const innerNext: NextFunction = (err?: unknown) => {
    res.status = originalStatus as typeof res.status;
    res.json = originalJson as typeof res.json;
    next(err as Error | undefined);
  };

  return apiValidator()(req, res, innerNext);
};

const coreModule: Module = {
  info: {
    name: "Core Module",
    description: "This file is for all core functionality.",
    version: "2.0.0",
    moduleVersion: "1.0.0",
    author: "AirLinkLab",
    license: "MIT",
  },

  router: () => {
    const router = Router();

    router.get(
      "/api/application/users",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const filter =
            typeof req.query.filter === "string"
              ? JSON.parse(req.query.filter)
              : req.query.filter;

          const include = req.query.include;
          const users = await prisma.users.findMany({
            where: filter || {},
          });

          let serverData: Prisma.ServerGetPayload<{
            include: { node: true; owner: true };
          }>[] = [];
          if (include && include === "servers") {
            serverData = await prisma.server.findMany({
              where: { ownerId: { in: users.map((user) => user.id) } },
              include: { node: true, owner: true },
            });
          }

          const response = users.map((user) => {
            const userData = {
              object: "user",
              attributes: {
                id: user.id,
                username: user.username,
                email: user.email,
                root_admin: user.isAdmin,
              },
              relationships: {
                servers: [] as {
                  object: string;
                  attributes: {
                    id: number;
                    name: string;
                    node: (typeof serverData)[number]["node"];
                  };
                }[],
              },
            };

            if (include && include === "servers" && serverData) {
              userData.relationships.servers = serverData
                .filter((server) => server.ownerId === user.id)
                .map((server) => ({
                  object: "server",
                  attributes: {
                    id: server.id,
                    name: server.name,
                    node: server.node,
                  },
                }));
            }

            return userData;
          });

          res.json({
            object: "list",
            data: response,
            meta: {
              pagination: {
                total: users.length,
                count: users.length,
                per_page: DEFAULT_PAGE_SIZE,
                current_page: 1,
                total_pages: 1,
                links: {},
              },
            },
          });
        } catch (error) {
          logger.error("Error fetching users:", error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      },
    );

    router.get(
      "/api/application/users/:user",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const userId = req.params.user;
          const filter =
            typeof req.query.filter === "string"
              ? JSON.parse(req.query.filter)
              : req.query.filter;
          const include = req.query.include;

          let user;

          if (userId) {
            user = await prisma.users.findUnique({
              where: { id: getParamAsNumber(userId) },
            });
          } else if (filter?.email) {
            user = await prisma.users.findUnique({
              where: { email: filter.email },
            });
          }

          if (!user) {
            res.status(404).json({ error: "Not Found" });
            return;
          }

          const userResponse = {
            object: "user",
            attributes: {
              id: user.id,
              username: user.username,
              email: user.email,
              root_admin: user.isAdmin || false,
              relationships: {
                servers: {
                  object: "null_resource",
                  attributes: {},
                  data: {},
                },
              },
            },
          };

          if (include === "servers") {
            const servers = await prisma.server.findMany({
              where: { ownerId: user.id },
              include: { node: true, owner: true },
            });

            const formattedServers = servers.map((server) => ({
              attributes: {
                id: server.id,
                UUID: server.UUID,
                name: server.name,
                description: server.description,
                createdAt: server.createdAt,
                ports: JSON.parse(server.Ports || "[]"),
                limits: {
                  memory: server.Memory,
                  disk: server.Storage,
                  cpu: server.Cpu,
                },
                variables: JSON.parse(server.Variables || "[]"),
                startCommand: server.StartCommand,
                dockerImage: JSON.parse(server.dockerImage || "{}"),
                installing: server.Installing,
                suspended: server.Suspended,
              },
              relationships: {
                node: {
                  attributes: {
                    id: server.node.id,
                    name: server.node.name,
                    ram: server.node.ram,
                    cpu: server.node.cpu,
                    disk: server.node.disk,
                    address: server.node.address,
                    port: server.node.port,
                    createdAt: server.node.createdAt,
                  },
                },
                owner: {
                  attributes: {
                    id: server.owner.id,
                    email: server.owner.email,
                    username: server.owner.username,
                    isAdmin: server.owner.isAdmin,
                    description: server.owner.description,
                  },
                },
              },
            }));

            userResponse.attributes.relationships.servers = {
              object: "server_list",
              attributes: formattedServers,
              data: formattedServers,
            };
          }

          res.status(200).json(userResponse);
        } catch (error) {
          logger.error("Error fetching user:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      },
    );

    router.post(
      "/api/application/users",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const { username, email, first_name, last_name, password } = req.body;

          if (!username || !email || !first_name || !last_name || !password) {
            res.status(400).json({ error: "Missing required fields" });
            return;
          }

          // Check if registration is allowed
          const userCount = await prisma.users.count();
          const isFirstUser = userCount === 0;

          if (!isFirstUser) {
            const settings = await getSettings();
            if (!settings || !settings.allowRegistration) {
              res.status(403).json({ error: "Registration is disabled" });
              return;
            }
          }

          const existingUser = await prisma.users.findUnique({
            where: { email },
          });

          if (existingUser) {
            res.status(400).json({ error: "User already exists" });
            return;
          }

          const hashedPassword = await bcrypt.hash(
            password,
            BCRYPT_SALT_ROUNDS,
          );

          const newUser = await prisma.users.create({
            data: {
              username,
              email,
              password: hashedPassword,
            },
          });

          res.status(201).json({
            attributes: {
              id: newUser.id,
              username: newUser.username,
              email: newUser.email,
            },
          });
        } catch (error) {
          logger.error("Error creating user:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      },
    );

    router.patch(
      "/api/application/users/:id",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const userId = getParamAsNumber(req.params.id);
          const { username, email, first_name, last_name, password } = req.body;

          if (!username && !email && !first_name && !last_name && !password) {
            res.status(400).json({ error: "No fields to update" });
            return;
          }

          const user = await prisma.users.findUnique({
            where: { id: userId },
          });

          if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
          }

          const updatedData: Record<string, string | undefined> = {};

          if (username) {
            updatedData.username = username;
          }
          if (email) {
            updatedData.email = email;
          }
          if (first_name) {
            updatedData.first_name = first_name;
          }
          if (last_name) {
            updatedData.last_name = last_name;
          }
          if (password) {
            updatedData.password = await bcrypt.hash(
              password,
              BCRYPT_SALT_ROUNDS,
            );
          }

          const updatedUser = await prisma.users.update({
            where: { id: userId },
            data: updatedData,
          });

          res.status(200).json({
            object: "user",
            attributes: {
              id: updatedUser.id,
              username: updatedUser.username,
              email: updatedUser.email,
            },
          });
        } catch (error) {
          logger.error("Error updating user:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      },
    );

    router.delete(
      "/api/application/users/:id",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const userId = getParamAsNumber(req.params.id);

          const user = await prisma.users.findUnique({
            where: { id: userId },
          });

          if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
          }

          // Never allow deleting the last admin — that would lock the panel.
          if (user.isAdmin) {
            const adminCount = await prisma.users.count({
              where: { isAdmin: true },
            });
            if (adminCount <= 1) {
              res
                .status(400)
                .json({ error: "Cannot delete the last admin user." });
              return;
            }
          }

          await prisma.users.delete({ where: { id: userId } });
          res.status(200).json({
            object: "user",
            attributes: { id: user.id, deleted: true },
          });
        } catch (error) {
          logger.error("Error deleting user:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      },
    );

    router.get(
      "/api/application/nodes",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const nodes = await prisma.node.findMany({
            include: {
              _count: {
                select: {
                  servers: true,
                },
              },
            },
          });

          const formattedNodes = nodes.map((node) => ({
            object: "node",
            attributes: {
              id: node.id,
              uuid: node.id.toString(),
              public: true,
              name: node.name,
              description: node.name,
              fqdn: node.address,
              scheme: "http",
              memory: node.ram * PTERO_MEMORY_MB,
              disk: node.disk * PTERO_DISK_MB,
              daemon_listen: node.port,
              created_at: node.createdAt.toISOString(),
              updated_at: node.createdAt.toISOString(),
            },
          }));

          res.json({
            object: "list",
            data: formattedNodes,
            meta: {
              pagination: {
                total: nodes.length,
                count: nodes.length,
                per_page: DEFAULT_PAGE_SIZE,
                current_page: 1,
                total_pages: 1,
                links: {},
              },
            },
          });
        } catch (error) {
          logger.error("Error fetching nodes:", error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      },
    );

    router.get(
      "/api/application/nodes/:id",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);

          const node = await prisma.node.findUnique({
            where: { id: nodeId },
            include: {
              servers: {
                select: {
                  id: true,
                  UUID: true,
                  name: true,
                  Memory: true,
                  Cpu: true,
                  Storage: true,
                },
              },
            },
          });

          if (!node) {
            res.status(404).json({ error: "Node not found" });
            return;
          }

          const formattedNode = {
            object: "node",
            attributes: {
              id: node.id,
              uuid: node.id.toString(),
              public: true,
              name: node.name,
              description: node.name,
              fqdn: node.address,
              scheme: "http",
              memory: node.ram * PTERO_MEMORY_MB,
              disk: node.disk * PTERO_DISK_MB,
              daemon_listen: node.port,
              created_at: node.createdAt.toISOString(),
              updated_at: node.createdAt.toISOString(),
            },
          };

          res.json({
            object: "node",
            data: [formattedNode],
          });
        } catch (error) {
          logger.error("Error fetching node:", error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      },
    );

    router.delete(
      "/api/application/nodes/:id",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);

          const node = await prisma.node.findUnique({
            where: { id: nodeId },
            select: {
              id: true,
              name: true,
              _count: { select: { servers: true } },
            },
          });

          if (!node) {
            res.status(404).json({ error: "Node not found" });
            return;
          }

          if (node._count.servers > 0) {
            res
              .status(400)
              .json({ error: "Cannot delete a node with assigned servers." });
            return;
          }

          await prisma.node.delete({ where: { id: nodeId } });
          res.status(200).json({
            object: "node",
            attributes: { id: node.id, deleted: true },
          });
        } catch (error) {
          logger.error("Error deleting node:", error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      },
    );

    router.post(
      "/api/application/servers",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        const name = req.body.name;
        const description = req.body.description || "Server Generated by API";
        const nodeId = Number(req.body.deploy.locations[0]);
        const imageId = req.body.egg;
        const Memory = req.body.limits.memory;
        const Cpu = req.body.limits.cpu;
        const Storage = req.body.limits.disk;
        const variables = req.body.environment;
        const dockerImage = req.body.docker_image;

        const servers = await prisma.server.findMany({
          where: { nodeId },
        });

        const allPossiblePorts = Array.from(
          { length: 100 },
          (_, i) => 25565 + i,
        );
        const usedPorts = getUsedExternalPorts(servers as { Ports: string }[]);

        const freePorts = allPossiblePorts.filter(
          (port) => !usedPorts.includes(port),
        );
        if (freePorts.length === 0) {
          res.status(400).send("No Free Ports Found.");
          return;
        }
        const randomFreePort =
          freePorts[Math.floor(Math.random() * freePorts.length)];
        const Ports = `${randomFreePort}:${randomFreePort}`;

        const userId = req.body.user;

        if (
          !name ||
          !description ||
          !nodeId ||
          !imageId ||
          !Ports ||
          !Memory ||
          !Cpu ||
          !Storage ||
          !userId
        ) {
          res.status(400).send("Missing required fields");
          return;
        }

        const Port = `[{"Port": "${Ports}", "primary": true}]`;

        try {
          const dockerImages = await prisma.images
            .findUnique({
              where: {
                id: imageId,
              },
            })
            .then((image) => {
              if (!image) {
                return null;
              }
              return image.dockerImages;
            });

          if (!dockerImages) {
            res.status(400).send("Docker image not found");
            return;
          }

          const imagesDocker = JSON.parse(dockerImages);

          type ImageDocker = Record<string, string>;

          const imageDocker: ImageDocker | undefined = imagesDocker.find(
            (image: ImageDocker) => Object.values(image).includes(dockerImage),
          );

          if (!imageDocker) {
            res.status(400).send("Docker image not found");
            return;
          }

          const image = await prisma.images.findUnique({
            where: {
              id: parseInt(imageId),
            },
          });

          if (!image) {
            res.status(400).send("Image not found");
            return;
          }

          const StartCommand = image.startup;

          if (!StartCommand) {
            res.status(400).send("Image startup command not found");
            return;
          }

          const server = await prisma.server.create({
            data: {
              name,
              description,
              ownerId: userId,
              nodeId,
              imageId: parseInt(imageId),
              Ports: Port || '[{"Port": "25565:25565", "primary": true}]',
              Memory: parseInt(Memory) || DEFAULT_MEMORY_MB,
              Cpu: parseInt(Cpu) || DEFAULT_CPU_PERCENT,
              Storage: parseInt(Storage) || DEFAULT_STORAGE_MB,
              Variables: JSON.stringify(variables) || "[]",
              StartCommand,
              dockerImage: JSON.stringify(imageDocker),
            },
          });

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

              let ServerEnv;
              try {
                ServerEnv = JSON.parse(server.Variables);
              } catch (error) {
                logger.error(
                  `Error parsing Variables for server ID ${server.id}:`,
                  error,
                );
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              if (!Array.isArray(ServerEnv)) {
                logger.error(
                  `ServerEnv is not an array for server ID ${server.id}. Skipping...`,
                );
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              const env = ServerEnv.reduce(
                (
                  acc: Record<string, string>,
                  curr: { env: string; value: string },
                ) => {
                  acc[curr.env] = curr.value;
                  return acc;
                },
                {},
              );

              if (server.image?.scripts) {
                let scripts;
                try {
                  scripts = JSON.parse(server.image.scripts);
                } catch (error) {
                  logger.error(
                    `Error parsing scripts for server ID ${server.id}:`,
                    error,
                  );
                  await prisma.server.update({
                    where: { id: server.id },
                    data: { Queued: false },
                  });
                  continue;
                }

                const requestBody = {
                  id: server.UUID,
                  env,
                  scripts: scripts.install.map(
                    (script: { url: string; fileName: string }) => ({
                      url: script.url,
                      fileName: script.fileName,
                    }),
                  ),
                };

                try {
                  await daemonRequest({
                    nodeAddress: server.node.address,
                    nodePort: server.node.port,
                    nodeKey: server.node.key,
                    method: "POST",
                    path: "/container/install",
                    body: requestBody,
                  });

                  await prisma.server.update({
                    where: { id: server.id },
                    data: { Queued: false },
                  });
                } catch (error) {
                  logger.error(
                    `Error sending install request for server ID ${server.id}:`,
                    error,
                  );
                }
              } else {
                logger.warn(
                  `No scripts found for server ID ${server.id}. Skipping...`,
                );
              }
            }
          });

          res.status(201).json({
            message: "Server created successfully",
            attributes: { id: server.UUID },
          });
        } catch (error) {
          logger.error("Error creating server:", error);
          res.status(500).send("Error creating server");
        }
      },
    );

    router.delete(
      "/api/application/servers/:id",
      legacyApiValidator,
      async (req: Request, res: Response) => {
        try {
          const serverId = String(req.params.id);

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          if (server.node) {
            try {
              await daemonRequest({
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                method: "DELETE",
                path: "/container",
                body: { id: server.UUID },
              });
            } catch (err: unknown) {
              const daemonErr = err as {
                status?: number;
                body?: { error?: string };
              };
              const isGone =
                daemonErr.status === 404 ||
                daemonErr.body?.error?.includes("not exist");
              if (!isGone) {
                logger.warn(`Could not delete container on daemon: ${err}`);
              }
            }
          }

          await prisma.server.delete({ where: { UUID: serverId } });

          res.status(200).json({
            object: "server",
            attributes: { id: serverId, deleted: true },
          });
        } catch (error) {
          logger.error("Error deleting server:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      },
    );

    return router;
  },
};

export default coreModule;
